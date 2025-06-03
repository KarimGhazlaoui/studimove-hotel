import React from 'react';
import { useParams, Link } from 'react-router-dom';

const RoomList = () => {
  const { id } = useParams();

  // Données fictives - à remplacer par un appel API réel plus tard
  const rooms = [
    {
      _id: '101',
      roomNumber: '101',
      capacity: 2,
      gender: 'mixed',
      isPrivate: false,
      price: 120,
      amenities: ['WiFi', 'TV', 'Climatisation']
    },
    {
      _id: '102',
      roomNumber: '102',
      capacity: 4,
      gender: 'mixed',
      isPrivate: false,
      price: 180,
      amenities: ['WiFi', 'TV', 'Climatisation', 'Mini-bar']
    }
  ];

  return (
    <div className="container mt-4">
      <Link to={`/hotels/${id}`} className="btn btn-light mb-3">
        Retour à l'hôtel
      </Link>
      
      <h2>Chambres disponibles</h2>
      
      <div className="row">
        {rooms.map(room => (
          <div className="col-md-4 mb-3" key={room._id}>
            <div className="card">
              <div className="card-header">
                Chambre {room.roomNumber}
              </div>
              <div className="card-body">
                <p>Capacité: {room.capacity} personnes</p>
                <p>Type: {room.isPrivate ? 'Privée' : 'Partagée'}</p>
                <p>Prix: {room.price}€ / nuit</p>
                <p>
                  Équipements: {room.amenities.join(', ')}
                </p>
                <button className="btn btn-success">Réserver</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RoomList;