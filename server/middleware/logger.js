const logAction = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Utilisateur: ${req.user?.name || 'Non authentifié'}`);
  next();
};

module.exports = logAction;