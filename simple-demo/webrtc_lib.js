var videosrc;
var ws_url;
var messages;
var remote_peer;
var peerConnection;
var caller = false;
var serverConnection;
var peerConnectionConfig;

var peerIdVar;
var local_stream_promise;
var constraints = {
        video: true,
        audio: true,
    };

navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

function getUserMediaSuccess(stream) {
    console.log('Local media read successful');
}

function getUserMediaError(error) {
    console.log(error);
	messages.value = messages.value + "\n getUserMediaError " + error;
}

function connect_ws(){
	videosrc = document.getElementById("video1");
	ws_url = document.getElementById("signaller");
	var peerconfigmsg = document.getElementById("peerconnectionconfig").value;
	peerconfigmsg.trim();
	peerConnectionConfig =  JSON.parse(peerconfigmsg);
    serverConnection = new WebSocket(ws_url.value);
    serverConnection.onmessage = gotMessageFromServer;
    serverConnection.onopen = ServerOpen;
    serverConnection.onerror = ServerError;
	serverConnection.onclose = onServerClose;
    
}

//Once page ready create websocket server connection and keep ready, constraints 
// to be kept false for audio and video as no media is sent from browser. Its receive only
//Add callbacks for onmessage, onopen, onerror
function pageReady() {
    messages = document.getElementById("messages");
	if (navigator.getUserMedia) {
        navigator.getUserMedia(constraints, function(stream) {
			  local_stream_promise = stream;
		}, getUserMediaError);
    } else {
        alert('Your browser does not support getUserMedia API');
    }
}

function getOurId() {
    return Math.floor(Math.random() * (9000 - 10) + 10).toString();
}

function ServerOpen() {
    console.log("Server open");
	messages.value = messages.value + "\n Server Connected";
	peerIdVar = getOurId();
	serverConnection.send('HELLO ' + peerIdVar);
    messages.value = messages.value + "\n Registering with Server as peer " + peerIdVar;
}

function ServerError(error) {
    console.log("Server error ", error);
	messages.value = messages.value + "\n Server Error " + error;
}


function start() {
    
	// Create peerConnection and attach onicecandidate, ontrack callbacks
    peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection.onicecandidate = gotIceCandidate;
    peerConnection.ontrack = gotRemoteStream;
	/* Send our video/audio to the other peer */
    local_stream_promise.getTracks().forEach(function(track) {
		console.log("getUserMedia Track added");
		peerConnection.addTrack(track, local_stream_promise);
	});	    	
}

function start_call(){
	remote_peer = document.getElementById("remote-peer").value;
	if(!serverConnection){
		console.error("No Server Connection");
		messages.value = messages.value + "\n No Server Connection !!!";
		return;
	}
	caller = true;
	serverConnection.send('SESSION ' + remote_peer);
}


function gotDescription(description) {
    console.log('got description ', description);
 
	//Apply the local description received on callback to peerConnection and on successful callback send the same to server
    peerConnection.setLocalDescription(description, function() {
        
		sdp = {'sdp': description}
		console.log("Sending SDP " + JSON.stringify(sdp));
        serverConnection.send(JSON.stringify(sdp));
		
    }, function() { console.log('set description error') });
}

//On 'gotIceCandidate' callback on 'peerConnection' send the same to server 
function gotIceCandidate(event) {
    console.debug("Ice Candidate: ", event);
    // We have a candidate, send it to the remote party with the
	if (event.candidate == null) {
            console.log("ICE Candidate was null, done");
            return;
	}
	var iceFromPeer = JSON.stringify({'ice': event.candidate});
	console.log("ICE Candidate from peer: " + iceFromPeer);
	serverConnection.send(iceFromPeer);
}

//On gotRemoteStream is triggered attach the streams[0] which will be a single video stream to srcObject of video tag on html
function gotRemoteStream(event) {
    console.log('got remote stream ', event);
    videosrc.srcObject  = event.streams[0];
}

function createOfferError(error) {
    console.log(error);
}

function createAnswerError(error) {
    console.log(error);
}

function resetState() {
    // This will call onServerClose()
    serverConnection.close();
}

function handleIncomingError(error) {
	console.error(error);
    messages.value = messages.value + "\n " + error;
    resetState();
}

function createOffer(){
	peerConnection.createOffer().then(gotDescription, createAnswerError)
}

function resetVideo() {
    // Release the webcam and mic
    if (local_stream_promise){
		local_stream_promise.getTracks().forEach(function(track) {
				track.stop();
		  });
	}
    
    // Reset the video element and stop showing the last received frame
    videosrc.pause();
    videosrc.src = "";
    videosrc.load();
}

function onServerClose(event) {
    messages.value = messages.value + "\n Disconnected From Server";
    resetVideo();

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    // Reset after a second
    //window.setTimeout(ServerOpen, 1000);
}

//On gotMessageFromServer check for 2 messages . rest are only informative, not needed for webrtc connection
function gotMessageFromServer(message) {
    console.info(" Message from server:", message);
    if(message.data == "SESSION_OK"){
		console.info(" Remote peer found: " + remote_peer);
		messages.value = messages.value + "\n Remote peer found: " + remote_peer;
		start();
		createOffer();
		return;
	}
	if(message.data == "HELLO"){
		console.info(" Registered with id: " + peerIdVar);
		messages.value = messages.value + "\n Registered with id: " + peerIdVar;
		document.getElementById("peer-id").textContent = peerIdVar;
		return;
	}
	if (message.data.startsWith("ERROR")) {
		console.error(message.data);
		messages.value = messages.value + "\n " + message.data;
		return;
	}
	// Handle incoming JSON SDP and ICE messages
	try {
		msg = JSON.parse(message.data);
	} catch (e) {
		if (e instanceof SyntaxError) {
			handleIncomingError("Error parsing incoming JSON: " + message.data);
		} else {
			handleIncomingError("Unknown error parsing response: " + message.data);
		}
		return;
	}
	// If no peer incoming mean incoming call
	if (!peerConnection){
		start();
	}
	if (msg.sdp != null) {
		console.log("Received SDP " + message.data);
		peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp), function() {
            //on successful callback function create answer which takes callback of 'gotDescription'
			console.log("Set remote description successfull, caller: " + caller);
			if(!caller){
				peerConnection.createAnswer(gotDescription, createAnswerError);
			}
            
        });
	} else if (msg.ice != null) {
		peerConnection.addIceCandidate(new RTCIceCandidate(msg.ice));
	} else {
		handleIncomingError("Unknown incoming JSON: " + msg);
	}
}