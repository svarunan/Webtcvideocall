var GUI = {
	socketId: 		document.getElementById('mySocketId'),
	roomForm: 		document.querySelector('#contact_list')
};

var socket = io("http://localhost:8080",{transports:['websocket']},{secure: true});
var conf = {
	mySocketId : "",
	local_stream: "",
	videoCall : false,
	peers : {},
	peersMedia : {},
	ice : [ {url:"stun:stun.l.google.com:19302"} ]
};
socket.on('connect',function(){
	conf.mySocketId = socket.id;
	console.info(conf.mySocketId,' : connected....');
	GUI.socketId.innerHTML = socket.id;

});
socket.on('serverMsg',function (data){
	console.log(data);
	if(data == "refresh"){
		clearContactsList();
		reqContactList();
	}
});
socket.on('contact',function (data){
	console.log(data);
	var remotePeer = data.peer_id;
	if(remotePeer == conf.mySocketId) return;
	if(data.type == "add"){
		$('#contact_list').append('<div id='+remotePeer+'><input type="checkbox" name="contact" value='+remotePeer+'>'+remotePeer+'</div>');
	}else if(data.type == "remove"){
		$('#'+remotePeer).remove();
	}
});
socket.on('onlineContacts',function (data){
	console.log('onlineContacts : ',data.peer_id);
	function onlineContacts(remotePeer){
		if(remotePeer != conf.mySocketId)
		 	$('#contact_list').append('<div id='+remotePeer+'><input type="checkbox" name="contact" value='+remotePeer+'>'+remotePeer+'</div>');				
	}
	if(typeof data.peer_id == "object"){
		for(var i=0;i < data.peer_id.length;i++){
			onlineContacts(data.peer_id[i]);
		}
	}else{
		onlineContacts(data.peer_id);
	}
});
socket.on('addPeer',function (data){
	var remotePeer = data.peer_id;	
	var myPeerCon = new RTCPeerConnection({"iceServers":conf.ice});
	console.info('Incoming : addPeer :',data);
	console.info('Creating RTCPeerConnection : ',myPeerCon);
	conf.peers[remotePeer] = myPeerCon; // add the new peer and your peer connection

	myPeerCon.onicecandidate = function (event){ // add your ice candidates on RTCPeerConnection connection.
		if (!myPeerCon || !event || !event.candidate) return;
		console.info('relayICECandidate to : ',remotePeer)
		socket.emit('relayICECandidate',{ // relay my ICE candidate to other side
			'peer_id' : remotePeer,
            'ice_candidate': {
                'sdpMLineIndex': event.candidate.sdpMLineIndex,
                'candidate': event.candidate.candidate
            }
		});
	}
	myPeerCon.onaddstream = function (event){ // on adding remote's mic and camera
		console.info('Got  : remote onaddstream : ',event);
		var remoteMediaElements = $("<video>");
		remoteMediaElements.attr("autoplay", "autoplay");
		remoteMediaElements.attr("controls",true);
		remoteMediaElements.attr("class","remotevideo");
		conf.peersMedia[remotePeer] = remoteMediaElements // update to peersMedia stack
		$('body').append(remoteMediaElements);
		attachMediaStream(remoteMediaElements[0],event.stream);	
	}
	myPeerCon.addStream(conf.local_stream); // attaching my mic and camera
	
	if(data.createOffer){
		console.info('creatingOffer to : addPeer :',remotePeer)
		myPeerCon.createOffer(function (localSdp){
			myPeerCon.setLocalDescription(localSdp, function(){
				socket.emit('relaySdp',{ "peer_id": remotePeer, "sdp": localSdp});
				console.info('Sending createOffer sdp : '+remotePeer+ " : ",localSdp);
			},
			function(error) {
			    alert(error);
			});    		
		});		
	}
});
socket.on('iceCandidate',function (data){
	console.info('iceCandidate received from : ',data.peer_id);
	var myPeerCon_remotePeer = conf.peers[data.peer_id],
		remoteIce = data.ice_candidate;
	console.info('adding ice_candidate : ',remoteIce);	
	myPeerCon_remotePeer.addIceCandidate(new RTCIceCandidate(remoteIce));
});

socket.on('sdp',function (data){
	var remotePeer  = data.peer_id;
	var myPeerCon_remotePeer = conf.peers[data.peer_id];
	var remoteSdp = data.sdp;
	console.info('sdp from : '+remotePeer+" : type : "+remoteSdp.type+" : ",remoteSdp);
	myPeerCon_remotePeer.setRemoteDescription(new RTCSessionDescription(remoteSdp), function (){
		if(remoteSdp.type == "offer"){
			myPeerCon_remotePeer.createAnswer(function (localSdp){
				myPeerCon_remotePeer.setLocalDescription(localSdp, function(){
					socket.emit('relaySdp', {"peer_id": remotePeer, "sdp": localSdp});
					console.info('Sending createAnswer Sdp to : ',remotePeer);
				},
				function(error) {
					alert(error)
				});
			});
		}		
	});
	// Create Answer to the received offer!

});
socket.on('removePeer',function (peer){
    if (peer in conf.peersMedia) {
        conf.peersMedia[peer].remove();
    }
    if (peer in conf.peers) {
        conf.peers[peer].close();
    }
    delete conf.peers[peer];
    delete conf.peersMedia[peer];
	console.info(peer,' : disconnected from server...');
});
socket.on('disconnect',function(){
	console.warn(conf.mySocketId,' : disconnected....');
	conf.mySocketId = "";
	GUI.socketId.innerHTML = "disconnected";
	clearContactsList();
});


function showHide(id){
	if(document.getElementById(id).style.display == ""){
		document.getElementById(id).style.display = "none";
	}else{
		document.getElementById(id).style.display = "";
	}
}
function get_local_stream(callback, errorback){
	getUserMedia({"audio":true, "video":true},
	    function(stream) {
	        console.log("getUserMedia success");
	        conf.local_stream = stream;
	        var local_media = $("<video>");
	        local_media.attr("autoplay", "autoplay");
	        local_media.attr("controls", true);
	        local_media.attr("class","localvideo")
	        console.debug('local_media attr',local_media)
	        $('body').append(local_media);
	        $('body').append('<br>');
	        attachMediaStream(local_media[0], stream);

	        if (callback) callback();
	    },
	    function() { /* user denied access to a/v */
	        console.log("Access denied for audio/video");
	        alert("access to the camera/microphone denied");
	        if (errorback) errorback();
	    });	
}
function reqContactList(){
	socket.emit('reqContactList',{reason:"some new ioInstance connected"});
}
function clearContactsList(){
	$('#contact_list')[0].innerHTML = ""; // remove all online contacts on your disconnect
}