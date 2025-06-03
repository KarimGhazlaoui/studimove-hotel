import axios from 'axios';

// Configuration d'axios pour l'API
const api = axios.create({
  baseURL: '/api', // ou votre URL d'API complète en développement
  headers: {
    'Content-Type': 'application/json'
  }
});

// Intercepteur pour voir les requêtes
api.interceptors.request.use(config => {
  console.log('Requête API:', config.method.toUpperCase(), config.url);
  return config;
});

// Intercepteur pour voir les réponses et erreurs
api.interceptors.response.use(
  response => {
    console.log('Réponse API:', response.status, response.config.url);
    return response;
  },
  error => {
    console.error('Erreur API:', 
      error.response ? error.response.status : 'Pas de réponse',
      error.config ? error.config.url : 'URL inconnue', 
      error.message
    );
    return Promise.reject(error);
  }
);

export default api;