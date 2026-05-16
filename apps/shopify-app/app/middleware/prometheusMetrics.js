// app/middleware/prometheusMetrics.js
const client = require('prom-client');
const collectDefaultMetrics = client.collectDefaultMetrics;

// Inicializa la recolección de métricas por defecto solo una vez
let metricsInitialized = false;
if (!metricsInitialized) {
	collectDefaultMetrics();
	metricsInitialized = true;
}

// Middleware Express para contar peticiones HTTP
const httpRequestCounter = new client.Counter({
	name: 'http_requests_total',
	help: 'Total de peticiones HTTP',
	labelNames: ['method', 'route', 'status']
});

function metricsMiddleware(req, res, next) {
	res.on('finish', () => {
		httpRequestCounter.inc({
			method: req.method,
			route: req.route ? req.route.path : req.path,
			status: res.statusCode
		});
	});
	next();
}

module.exports = {
	metricsMiddleware,
	register: client.register
};
