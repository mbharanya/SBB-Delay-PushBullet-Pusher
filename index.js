const fs = require('fs');
const axios = require('axios');
const dateFormat = require('dateformat');
const PushBullet = require('pushbullet');

fs.readFile('config.json', 'utf8', (err, data) => {
    if (err) throw err;
    JSON.parse(data).forEach( entry => {
        sendDelays(entry.from, entry.to, entry.time)
    })
});

function sendDelays(from, to, time) {
    axios.get('http://transport.opendata.ch/v1/connections', {
        params: {
            from: from,
            to: to,
            date: dateFormat(new Date(), 'yyyy-mm-dd'),
            time: time,
            limit: 1
        }
    }).then(response => {
        let delay = response.data.connections[0].from.delay;
        if (delay){
            fs.readFile('pushbullet-api-key', "utf8", (err, data) => {
                let pusher = new PushBullet(data.trim());
                pusher.note({}, from+' -> '+to+' Delay', 'Delay is '+delay+' min', function(error, response) {console.log(arguments)});
            });
        }
    });
}
