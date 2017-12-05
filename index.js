const fs = require('fs');
const axios = require('axios');
const dateFormat = require('dateformat');
const moment = require('moment')
const PushBullet = require('pushbullet');

const CONFIG_FILE_NAME = 'config.json';
const LAST_DELAYS_FILE_NAME = 'last-delays.json';
const PUSHBULLET_API_KEY_FILE_NAME = 'pushbullet-api-key';

const DEFAULT_ENCODING = 'utf8';
const MINUTES_DELTA = 30;


fs.readFile(CONFIG_FILE_NAME, DEFAULT_ENCODING, (err, data) => {
    if (err) throw err;
    JSON.parse(data).forEach(entry => {
        if (isConfiguredWeekday(entry))
            sendDelays(entry.from, entry.to, entry.time)
    })

    function isConfiguredWeekday(entry) {
        return entry.weekdays.includes(dateFormat(new Date(), 'ddd').toLowerCase());
    }
});

function sendDelays(from, to, time) {
    let timeToCheck = moment(time, 'HH:mm');
    let minutesDifference = timeToCheck.diff(moment.now(), 'minutes');

    if (minutesDifference > MINUTES_DELTA || minutesDifference < -MINUTES_DELTA) {
        return;
    }

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
        if (delay) {
            fs.readFile(LAST_DELAYS_FILE_NAME, DEFAULT_ENCODING, (err, data) => {
                if (err) throw err;

                let lastDelays = JSON.parse(data);
                let hasNewDelay = lastDelays.some(connectionEntry => {
                    return isSameConnection(connectionEntry, from, to, time) &&
                        connectionEntry.lastDelay != delay;
                });

                if (hasNewDelay) {
                    fs.readFile(PUSHBULLET_API_KEY_FILE_NAME, DEFAULT_ENCODING, (err, data) => {
                        if (err) throw err;
                        let pusher = new PushBullet(data.trim());
                        pushMessage(pusher, {
                            from: from,
                            to: to,
                            time: time,
                        }, {
                            delay: delay,
                            time: response.data.connections[0].from.prognosis.departure,
                            platform: response.data.connections[0].from.prognosis.platform,
                            arrival: response.data.connections[0].from.prognosis.arrival
                        });

                        lastDelays.forEach(connectionEntry => {
                            if (isSameConnection(connectionEntry, from, to, time)) {
                                connectionEntry.lastDelay = delay;
                            }
                        });
                        fs.writeFile(LAST_DELAYS_FILE_NAME, JSON.stringify(lastDelays), DEFAULT_ENCODING, (err) => {
                            if (err) throw err;
                        });
                    });
                }
            });
        }
    });
}

function isSameConnection(connectionEntry, from, to, time) {
    return connectionEntry.from == from &&
        connectionEntry.to == to &&
        connectionEntry.time == time;
}

function pushMessage(pusher, connection, prognosis) {
    pusher.note(
        {},
        `${connection.from} -> ${connection.to} Delay at ${connection.time}`,
        `Delay is ${prognosis.delay} min\n`+
        `Prognosis: ${prognosis.time}\n`+
        `Platform: ${prognosis.platform}\n`+
        `Arrival: ${prognosis.arrival}\n`
        ,
        function (error, response) {
            if (error) throw error;
        });
}
