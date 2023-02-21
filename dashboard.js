// * Description: This file is used for initializing the dashboard

// * Import Modules
const express = require('express'),
	app = express();
const axios = require('axios');
const qs = require('qs');
const config = require('./env.json');
const cookieParser = require('cookie-parser');
const { PermissionsBitField } = require('discord.js');
let { client } = require('./bot.js');


// setting view engine to ejs
app.set('view engine', 'ejs');
app.use(express.static('./views'));
app.use(cookieParser(config['cookieSecret']));
app.use(logErrors)
app.use(clientErrorHandler)
app.use(errorHandler)

function logErrors (err, req, res, next) {
  console.error(err.stack)
  next(err)
}

function clientErrorHandler (err, req, res, next) {
  if (req.xhr) {
    res.status(500).send({ error: 'Something failed!' })
  } else {
    next(err)
  }
}

function errorHandler (err, req, res, next) {
  res.status(500)
  res.render('error', { error: err })
}

// route for index page
app.get('/', function(req, res) {
	res.render('index');
});

// route for support page
app.get('/support', function(req, res) {
	res.status(308).redirect('https://discord.gg/2nDJmR98nY');
});
// route for redirect
app.get('/invite', function(req, res) {
	let extra = '';
	if(req.query.server) extra += '&guild_id=' + req.query.server;
	res.status(308).redirect('https://discord.com/api/oauth2/authorize?client_id=1076722106684952616&permissions=' + config.normalPermissions + '&redirect_uri=https%3A%2F%2Farcher.egretdevelopment.com%2Fredirect&response_type=code&scope=bot%20identify%20applications.commands%20guilds' + extra);
});

// route for login page
app.get('/login', function(req, res) {
	let cookies = req.cookies;
	if(!cookies['userdata'] || !cookies['tokenData']) {
		res.redirect('https://discord.com/api/oauth2/authorize?client_id=1076722106684952616&redirect_uri=https%3A%2F%2Farcher.egretdevelopment.com%2Fredirect&response_type=code&scope=identify%20guilds');
	}else{
		res.redirect('/dashboard');
	}
});

// route for redirect
app.get('/redirect', async function(req, res) {
	const code = req.query.code;
	const token = await exchangeCode(code);
	if (token.error) return res.redirect('/login');
	login(res, token);
});

async function login(res, token) {
	const identity = await getIdentity(res, token.access_token);
	if(!identity) return;
	let options = {
		maxAge: (1000 * token.expires_in) - 10000,
		httpOnly: true,
		signed: false,
	};
	token['expires_at'] = (Date.now() + options.maxAge);
	res.cookie('userdata', JSON.stringify(identity), options);
	res.cookie('tokenData', JSON.stringify(token), options);
	res.redirect('/dashboard');
}

// route for logout
app.get('/logout', function(req, res) {
	res.clearCookie('userdata');
	res.clearCookie('tokenData');
	res.redirect('/');
});

// route for dashboard
app.get('/dashboard', async function(req, res) {
	if (!req.cookies['userdata'] || JSON.parse(req.cookies['userdata']).username == undefined || JSON.parse(req.cookies['userdata']).avatar == undefined || JSON.parse(req.cookies['userdata']).id == undefined) {
		return res.redirect('/login');
	}
	let tokenData = JSON.parse(req.cookies['tokenData']);
	if(Math.abs(tokenData['expires_at'] - Date.now()) < (1000 * 60 * 60 * 24)) {
		let newToken = await refreshCode(res, tokenData['refresh_token'])
		if(!newToken) return;
		return login(res, newToken);
	};
	let username = JSON.parse(req.cookies['userdata']);
	let guilds = await getGuilds(res, JSON.parse(req.cookies['tokenData'])['access_token']);
	if(!guilds) return;
	let botGuilds = client.guilds.cache.map(guild => guild.id);
	let guildsData = '';
	for (let i in guilds) {
		let permissions = new PermissionsBitField(guilds[i]['permissions']);
		let title;
		let color;
		if (!permissions.has('ManageGuild') && !permissions.has('Administrator')) continue;
		if (botGuilds.includes(guilds[i]['id'])) {
			title = 'The Archer is in this server';
			color = 'primary';
		} else {
			title = 'The Archer is not in this server';
			color = 'danger';
		}
		guildsData += '<div onclick="window.location.href=\'/server?guild=' + guilds[i]['id'] + '\'" class="col-md-6 col-xl-3 mb-4"><div class="card shadow border-start-primary py-2"><div class="card-body"><div class="row align-items-center no-gutters"><div class="col me-2"><div class="text-uppercase text-' + color + ' fw-bold text-xs mb-1"><span>' + title + '</span></div><div class="text-dark fw-bold h5 mb-0"><span>' + guilds[i]['name'] + '</span></div></div><div class="col-auto"><i class="fas fa-server fa-2x text-gray-300"></i></div></div></div></div></div>';
	}
	res.render('dashboard/index', { username: username.username, avatar: 'https://cdn.discordapp.com/avatars/' + username.id + '/' + username.avatar + '.png', guilds: guildsData });
});

// Server Route
app.get('/server', async function(req, res) {
	if (!req.cookies['userdata'] || JSON.parse(req.cookies['userdata']).username == undefined || JSON.parse(req.cookies['userdata']).avatar == undefined || JSON.parse(req.cookies['userdata']).id == undefined) {
		return res.redirect('/login');
	}
	if(!req.query.guild) return res.redirect('/dashboard');
	let guild = req.query.guild;
	let botGuilds = client.guilds.cache.map(guild => guild.id);
	if(!botGuilds.includes(guild)) return res.redirect('/invite?server=' + guild);

})

async function getGuilds(res, token) {
	const payload = {
		method: 'get',
		url: 'https://discord.com/api/v10/users/@me/guilds',
		headers: {
			'Authorization': 'Bearer ' + token,
		},
	};
	let guilds;
	try {
		const temp = await axios(payload);
		guilds = temp.data;
	}
	catch (e) {
		e = JSON.stringify(e);
    alert(e);
		res.send('First, try deleting the cookies and reload. If this does not resolve after that, please contact our support with the following information: <br /><br />' + e);
	}
	return guilds;
}

async function exchangeCode(code) {
	let data = qs.stringify({
		'client_id': config['clientId'],
		'client_secret': config['clientSecret'],
		'grant_type': 'authorization_code',
		'code': code,
		'redirect_uri': config['redirectURL'],
	});
	let payload = {
		method: 'post',
		url: 'https://discord.com/api/v10/oauth2/token',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		data : data,
	};
	let token;
	try {
		const temp = await axios(payload);
		token = temp.data;
	}
	catch (e) {
		token = e;
	}
	return token;

}

async function refreshCode(res, code) {
	let data = qs.stringify({
		'client_id': config['clientId'],
		'client_secret': config['clientSecret'],
		'grant_type': 'refresh_token',
		'refresh_token': code,
		'redirect_uri': config['redirectURL'],
	});
	let payload = {
		method: 'post',
		url: 'https://discord.com/api/v10/oauth2/token',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		data : data,
	};
	let token;
	try {
		const temp = await axios(payload);
		token = temp.data;
	}
	catch (e) {
		e = JSON.stringify(e);
    alert(e);
		res.send('First, try deleting the cookies and reload. If this does not resolve after that, please contact our support with the following information: <br /><br />' + e)
	}
	return token;

}

async function getIdentity(res, token) {
	const payload = {
		method: 'get',
		url: 'https://discord.com/api/v10/users/@me',
		headers: {
			'Authorization': 'Bearer ' + token,
		},
	};
	let identity;
	try {
		const temp = await axios(payload);
		identity = temp.data;
	}
	catch (e) {
		e = JSON.stringify(e);
    alert(e);
		res.send('First, try deleting the cookies and reload. If this does not resolve after that, please contact our support with the following information: <br /><br />' + e)
	}
	return identity;
}

app.listen(80, function() {
	console.log('Server is running on port 80 ');
});