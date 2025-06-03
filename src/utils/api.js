import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Intercepteur pour gérer les erreurs
api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error(err);
    return Promise.reject(err);
  }
);

export default api;