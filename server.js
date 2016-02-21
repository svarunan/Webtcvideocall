var path 			= require("path"),
	PORT 			= 8080,
	express 		= require('express'),
	http 			= require('http'),
	bodyParser 		= require('body-parser'),
	app 			= express(),
	serveFile		= require('serve-static'),
	fs 				= require('fs'),	
	sslOptions 		= {key: fs.readFileSync('../ssl/key.pem'),cert: fs.readFileSync('../ssl/cert.pem')},
	https  			= require('https'),
	server 			= https.createServer(sslOptions,app),
	io  			= require('socket.io').listen(server),
	bodyParser 		= require('body-parser');

// to reder html file with subs object
app.set('views', __dirname + '/public');
app.engine('html', require('ejs').renderFile);

app.use(serveFile('public'));
app.set('view engine', 'ejs');

var rooms = {}; // room to client id mapping
var clients = {} // client  to room id mapping

app.use(bodyParser.urlencoded({ extended: false }));
app.get('/clients', function (req, res){
	res.send(Object.keys(io.sockets.connected));
});
app.get('/', function (req,res){
	var renderObj = {};
	if(req.query && req.query['room']){
		renderObj.roomName = req.query['room'];
	}else{
		renderObj.roomName = "empty";
	}
	res.render('clientTemp.html',renderObj);
});

server.listen(PORT,function() {
    console.log("Listening on port " + PORT);
});

io.on('connection',function(socket){
	console.log(socket.id,': -- new conn');
	io.emit('contact',{peer_id: socket.id,type:"add"}); // Emit new user to online peers 

	socket.on('reqContactList',function (data){
		console.log('reqContactList from : '+socket.id+ " : "+data);
		clientsList(socket);
	});
	socket.on('addRoom',function (data){
		if (!(data.room_id in rooms)){ // Add new room name if it does not exist!
			rooms[data.room_id] = {};
		}
		rooms[data.room_id][data.socket_id] = socket; 
		clients[data.socket_id] = data.room_id; // Mapping client to room name
		console.log('room json\n',rooms);
		console.log('clients json\n',clients);
	});
	socket.on('joinRoom',function (data){
		if (!(data.room_id in rooms)){ // Add new room name if it does not exist!
			console.log(socket.id," : there is no room on : "+data.room_id);
		}else{ 
			clients[data.socket_id] = data.room_id; // Mapping client to room name
			for(id in rooms[data.room_id]){
				// Send join mesage and addPeer to members in this room
				io.to(id).emit('serverMsg',data.socket_id+" joined your room");
	            io.to(id).emit('addPeer', {'peer_id': socket.id, 'createOffer': false});
	            socket.emit('addPeer', {'peer_id': id, 'createOffer': true});		
			}
			rooms[data.room_id][data.socket_id] = socket;
		}
		// console.log('room json\n',rooms);
		console.log('clients json\n',clients);
	});
    socket.on('relayICECandidate', function(config) {
        var peer_id = config.peer_id;
        var ice_candidate = config.ice_candidate;
        console.log("["+ socket.id + "] relaying ICE candidate to [" + peer_id + "] ");

        if (peer_id in clients) {
            io.to(peer_id).emit('iceCandidate', {'peer_id': socket.id, 'ice_candidate': ice_candidate});
        }
    });
    socket.on('relaySdp', function(config) {
        var peer_id = config.peer_id;
        var sdp = config.sdp;
        console.log("["+ socket.id + "] relaying sdp to [" + peer_id + "] ");
        if (peer_id in clients) {
            io.to(peer_id).emit('sdp', {'peer_id': socket.id, 'sdp': sdp});
        }
    });   
	socket.on('disconnect',function (){
		console.log(socket.id,': --client disconnected');
		io.emit('contact',{peer_id: socket.id,type:"remove"});
		var socket_room = clients[socket.id];
		for(id in rooms[socket_room]){
			io.to(id).emit('removePeer',socket.id);	
		}
		if( socket_room && Object.keys(rooms[socket_room]).length > 0 ){ 
			delete rooms[socket_room][socket.id] ;
			console.log(socket_room," : this room has "+socket.id+" so removing him from rooms list");
		}
		if( socket_room && Object.keys(rooms[socket_room]).length == 0 ){ // If this room is empty delete the room
			delete rooms[socket_room];
			console.log(socket_room," : now this room empty so deleting it!");
		}
		delete clients[socket.id] // remove from clients list
	});
});

function clientsList(socket){
	for(key in io.sockets.adapter.rooms){
		if(!key.match("room_")){ // all our rooms name will be created with prefix string "room_"
			socket.emit('onlineContacts',{"peer_id":key});
		}
	}
}
