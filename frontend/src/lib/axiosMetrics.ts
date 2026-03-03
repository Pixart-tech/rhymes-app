import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

// Prevent duplicate interceptor registration during HMR.
if (!(axios as any).__metricsInterceptorAttached) {
  const startKey = '__axiosRequestStart';

  const stampStart = (config: InternalAxiosRequestConfig) => {
    (config as AxiosRequestConfig & { [startKey]?: number })[startKey] = performance.now();
    return config;
  };

  const logDuration = (config?: AxiosRequestConfig, outcome: 'success' | 'error' = 'success') => {
    if (!config) {
      return;
    }
    const startedAt = (config as { [startKey]?: number })[startKey];
    if (typeof startedAt !== 'number') {
      return;
    }
    const elapsedMs = performance.now() - startedAt;
    const method = config.method?.toUpperCase() ?? 'GET';
    const url = config.url ?? '';
    const label = outcome === 'success' ? 'completed' : 'failed';
    // eslint-disable-next-line no-console
    console.info(`[API] ${method} ${url} ${label} in ${Math.round(elapsedMs)}ms`);
  };

  axios.interceptors.request.use(stampStart);

  axios.interceptors.response.use(
    (response) => {
      logDuration(response.config, 'success');
      return response;
    },
    (error) => {
      logDuration(error.config, 'error');
      return Promise.reject(error);
    }
  );

  (axios as any).__metricsInterceptorAttached = true;
}
