import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const HotelList = () => {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simuler un chargement d'API
    setTimeout(() => {
      setHotels([
        { _id: '1', name: 'Grand Hôtel Paris', address: { city: 'Paris', country: 'France' } },
        { _id: '2', name: 'Résidence Marseille', address: { city: 'Marseille', country: 'France' } }
      ]);
      setLoading(false);
    }, 1000);
    
    // Plus tard, vous remplacerez ceci par un appel API réel
    // const fetchHotels = async () => {
    //   try {
    //     const res = await axios.get('http://localhost:5000/api/hotels');
    //     setHotels(res.data);
    //     setLoading(false);
    //   } catch (err) {
    //     console.error("Erreur lors du chargement des hôtels:", err);
    //     setLoading(false);
    //   }
    // };
    // fetchHotels();
  }, []);

  if (loading) return <div>Chargement...</div>;

  return (
    <div className="container mt-4">
      <h2>Liste des Hôtels</h2>
      {hotels.length === 0 ? (
        <p>Aucun hôtel disponible. Veuillez en ajouter.</p>
      ) : (
        <div className="row">
          {hotels.map(hotel => (
            <div className="col-md-4 mb-3" key={hotel._id}>
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">{hotel.name}</h5>
                  <p className="card-text">
                    {hotel.address?.city}, {hotel.address?.country}
                  </p>
                  <Link to={`/hotels/${hotel._id}`} className="btn btn-primary">
                    Voir les détails
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-success mt-3">Ajouter un hôtel</button>
    </div>
  );
};

export default HotelList;