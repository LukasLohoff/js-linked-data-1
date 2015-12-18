// Map config
var cityCenter = [51.960942, 7.625891]; // Coords of the city center of Münster
var zoomLevel = 11; // Initial zoom level of Münster

// HTML config
var yearSliderId = "#year-slider";
var yearValue = "#year";
var mapId = "map";
var diagramId = "#diagram";
var yearActiveId = "#active_year";

// JS config
var map;

function updateYear() {
	if ($(yearActiveId).prop("checked")) {
		$(yearValue).text($(yearSliderId).slider("value"));
	}
	else {
		$(yearValue).text("All");
	}
}

$(function () {
	// Init map
	map = L.map(mapId).setView(cityCenter, zoomLevel);
	L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
	}).addTo(map);
	L.geoJson(boundaries, {}).addTo(map);

	// Init year slider
	$(yearSliderId).slider({
		value: 2014,
		min: 2010,
		max: 2014,
		step: 1,
		slide: function (event, ui) {
			$(yearValue).text(ui.value);
			$(yearActiveId).prop("checked", true);
		}
	});
	updateYear();

	$(yearActiveId).change(updateYear);

	// Init diagram
	$(diagramId).highcharts({
		title: {
			text: 'Unemployment in Muenster',
			x: -20 //center
		},
		subtitle: {
			text: 'Source: Stadt Muenster',
			x: -20
		},
		xAxis: {
			categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
				'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
		},
		yAxis: {
			title: {
				text: 'Number of Persons'
			},
			plotLines: [{
					value: 0,
					width: 1,
					color: '#808080'
				}]
		},
		tooltip: {
			valueSuffix: '# Unit'
		},
		legend: {
			layout: 'vertical',
			align: 'right',
			verticalAlign: 'middle',
			borderWidth: 0
		},
		series: [{
				name: 'Graph One',
				data: [7.0, 6.9, 9.5, 14.5, 18.2, 21.5, 25.2, 26.5, 23.3, 18.3, 13.9, 9.6]
			}, {
				name: 'Graph Two',
				data: [-0.2, 0.8, 5.7, 11.3, 17.0, 22.0, 24.8, 24.1, 20.1, 14.1, 8.6, 2.5]
			}]
	});
});

// TODO: Add SPARQL query library