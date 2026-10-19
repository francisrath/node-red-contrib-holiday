module.exports = function (RED) {
    var Holidays = require('date-holidays')

    var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // One instance just for the editor's dropdowns. The lookup methods don't
    // care how it was initialised, so there's nothing to configure here.
    var places = new Holidays();

    // What the editor offers in its Country / State / Region dropdowns:
    // no country yields the countries, a country its states, a state its regions.
    // date-holidays answers undefined where there is nothing to offer, and the
    // editor wants an empty list rather than an error.
    RED.httpAdmin.get('/holiday/places', RED.auth.needsPermission('holiday.read'), function (req, res) {
        var country = req.query.country;
        var state = req.query.state;
        var found = !country ? places.getCountries('en')
            : !state ? places.getStates(country, 'en')
                : places.getRegions(country, state, 'en');

        res.json(found || {});
    });

    function HolidayNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        var types = [];

        if (config.typePublic)
            types.push('public');

        if (config.typeBank)
            types.push('bank');

        if (config.typeSchool)
            types.push('school');

        if (config.typeObservance)
            types.push('observance');

        if (config.typeOptional)
            types.push('optional');

        // empty string, not null: date-holidays mistakes a null state/region for the options object.
        // an empty types list means every type — that is date-holidays' own fallback, kept on purpose.
        var hd = new Holidays(
            config.country,
            config.state || '',
            config.region || '',
            {
                languages: config.languages,
                types: types,
                timezone: config.timezone || undefined
            });

        // an unknown country code doesn't throw, it just never matches a holiday
        if (!(config.country in hd.getCountries())) {
            node.error('Unknown country: ' + config.country);
            node.status({ fill: 'red', shape: 'ring', text: 'unknown country' });
            return;
        }

        // the timezone date-holidays itself evaluates in, so the weekday agrees with the holiday
        var timezone = config.timezone || hd.getTimezones()[0];
        var weekday;

        try {
            weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
        }
        catch (err) {
            node.error('Unknown timezone: ' + timezone);
            node.status({ fill: 'red', shape: 'ring', text: 'unknown timezone' });
            return;
        }

        var weekendDays = (config.weekend || '').split(",");

        node.on('input', function (msg) {

            var date = new Date(msg.payload);

            if (isNaN(date)) {
                node.status({ fill: 'red', shape: 'ring', text: 'not a date' });
                node.error('msg.payload is not a date: ' + msg.payload, msg);
                return;
            }

            // date-holidays v3 returns an array of matches, or false
            var holidays = hd.isHoliday(date);
            var dayOfWeek = WEEKDAYS.indexOf(weekday.format(date)).toString();
            var isWeekend = weekendDays.includes(dayOfWeek);

            if (!!holidays || isWeekend) {
                if (!!holidays) {
                    msg.holiday = holidays[0];
                    msg.holidays = holidays;
                }

                if (isWeekend)
                    msg.weekend = true;

                node.status({ fill: 'blue', shape: 'dot', text: holidays ? holidays[0].name : 'weekend' });
                node.send([msg, null]);
            }
            else {
                node.status({});
                node.send([null, msg]);
            }
        });
    }
    RED.nodes.registerType("holiday", HolidayNode);
}
