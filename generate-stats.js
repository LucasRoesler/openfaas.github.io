const https = require('https');
const fs = require('fs');

const maxRetry = 3;
let retries = 0;

var SI_SYMBOL = ["", "k", "M", "G", "T", "P", "E"];

function abbreviateNumber(number){
	const tier = Math.log10(number) / 3 | 0;

	if (tier == 0) {
		return number;
	}

	const suffix = SI_SYMBOL[tier];
	const scale = Math.pow(10, tier * 3);

	const scaled = number / scale;

	return scaled.toFixed(1) + suffix;
}

function httpsPost({body, ...options}) {
	return new Promise((resolve,reject) => {
		const req = https.request({
			method: 'POST',
			...options,
		}, res => {
			const chunks = [];

			res.on('data', data => chunks.push(data))
			res.on('end', () => {
				let body = Buffer.concat(chunks);

				switch(res.headers['content-type']) {
					case 'application/json':
					try {
						body = JSON.parse(body);
					} catch (e) {
						console.log('Failed to parse response, retrying...');
						if (retries < maxRetry) {
							retries += 1;
							console.log('Attempt ' + retries);
							postRequest()
						}
					}
					break;
				}

				resolve(body)
			})
		})
		req.on('error', reject);

		if (body) {
			req.write(body);
		}

		req.end();
	})
}

function generateTemplate(data) {
	const templateString =  `/* ------------------------
		THIS FILE IS AUTOMATICALLY GENERATED
		WITH THE node generate-stats COMMAND
		!!!DO NOT EDIT IT HERE!!!
		USE generate-stats.js for adjustments.
		------------------------*/
		var contributors = ${JSON.stringify(Object.entries(data))};
        var userRows;
		var rows = [14, 14, 14, 14]; // users/row;
		var maxRowSize = rows.slice().sort().reverse()[0];

		var rowsString = '';

		function shuffle(array) {
			for (let i = array.length - 1; i > 0; i--) {
				let j = Math.floor(Math.random() * (i + 1));

				[array[i], array[j]] = [array[j], array[i]];
			}
		}

		function userTemplate(userData) {
			var link = 'https://github.com/' + userData[0];
			var img = '<img alt="'+userData[0]+'" src="' + link + '.png">';
			var figure = '<a id="'+userData[0]+'"><figure class="image">' + img + '</figure></a>';

			return figure;
		}

		shuffle(contributors);

		function buildRows(rowSet) {
            rows.forEach(r => {
    			rowsString += '<div class="user-row">';

    			for (var i = 0; i < r; i++) {
    				rowsString += userTemplate(contributors.shift());
    			}

    			rowsString += '</div>';
    		});

            return rowsString
        }

		document.addEventListener('DOMContentLoaded', function() {
		    userRows = document.getElementById('github-users');

			userRows.innerHTML = buildRows(rows);
		});`;

	return templateString.replace(/^(\t\t)/gm, '');
}

function postRequest() {
	console.log('Fetching data from kenfdev.o6s.io/github-stats via POST.');

	httpsPost({
		hostname: 'kenfdev.o6s.io',
		port: 443,
		path: '/github-stats',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			org: 'openfaas'
		})
	}).then(resp => {
		resp.total.stars = abbreviateNumber(resp.total.stars);

		fs.writeFile('_data/github_stats.json', JSON.stringify(resp), 'utf8', () => {
			console.log('Github stats file generated');
		});


		// screen data to remove users that have asked to be removed or
		// need to be removed for any other reason
		delete resp.byLogin["mjallday"]

		fs.writeFile('js/contributors.js', generateTemplate(resp.byLogin), 'utf8', () => {
			console.log('js/contributors.js file generated');
		});
	}).catch(err => {
		console.log(err);
	})
}

postRequest()
