import React from 'react';
import { useParams, Link } from 'react-router-dom';

const HotelDetail = () => {
  const { id } = useParams();

  // Données fictives - à remplacer par un appel API réel plus tard
  const hotel = {
    _id: id,
    name: id === '1' ? 'Grand Hôtel Paris' : 'Résidence Marseille',
    address: {
      street: id === '1' ? '1 Rue de Rivoli' : '23 Avenue du Prado',
      city: id === '1' ? 'Paris' : 'Marseille',
      postalCode: id === '1' ? '75001' : '13008',
      country: 'France'
    },
    description: id === '1' ? 'Hôtel de luxe au cœur de Paris' : 'Vue imprenable sur la Méditerranée',
    contactInfo: {
      phone: id === '1' ? '+33 1 23 45 67 89' : '+33 4 91 23 45 67',
      email: id === '1' ? 'contact@grandhotel.fr' : 'info@residencemarseille.fr'
    }
  };

  return (
    <div className="container mt-4">
      <Link to="/" className="btn btn-light mb-3">Retour aux hôtels</Link>
      
      <div className="card">
        <div className="card-header">
          <h2>{hotel.name}</h2>
        </div>
        <div className="card-body">
          <h5>Informations</h5>
          <p>{hotel.description}</p>
          
          <h5>Adresse</h5>
          <p>
            {hotel.address.street}<br />
            {hotel.address.postalCode} {hotel.address.city}<br />
            {hotel.address.country}
          </p>
          
          <h5>Contact</h5>
          <p>
            Téléphone: {hotel.contactInfo.phone}<br />
            Email: {hotel.contactInfo.email}
          </p>
          
          <Link to={`/hotels/${id}/rooms`} className="btn btn-primary">
            Voir les chambres
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HotelDetail;