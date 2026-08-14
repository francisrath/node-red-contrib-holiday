module.exports = function (RED) {
    function HolidayNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        var Holidays = require('date-holidays')

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

        // empty string, not null: date-holidays treats a null state/region as the options object
        var hd = new Holidays(
            config.country,
            config.state || '',
            config.region || '',
            {
                languages: config.languages,
                types: types
            });

        node.on('input', function (msg) {

            // date-holidays v3 returns an array of matches, or false
            var holidays = hd.isHoliday(msg.payload);
            var dayOfWeek = new Date(msg.payload).getDay().toString();
            var isWeekend = config.weekend.split(",").includes(dayOfWeek);

            if (!!holidays || isWeekend) {
                if (!!holidays) {
                    msg.holiday = holidays[0];
                    msg.holidays = holidays;
                }

                if (isWeekend)
                    msg.weekend = true;

                node.send([msg, null]);
            }
            else {
                node.send([null, msg]);
            }
        });
    }
    RED.nodes.registerType("holiday", HolidayNode);
}