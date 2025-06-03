import React, { useState } from 'react';

const GuestRegistration = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    hotel: '',
    roomType: '',
    arrivalDate: '',
    departureDate: ''
  });

  const { firstName, lastName, email, phone, hotel, roomType, arrivalDate, departureDate } = formData;

  const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = e => {
    e.preventDefault();
    console.log('Données d\'enregistrement:', formData);
    // Ici, vous feriez un appel API pour enregistrer le client
  };

  return (
    <div className="container mt-4">
      <h2>Enregistrement d'un Client</h2>
      <form onSubmit={onSubmit}>
        <div className="row">
          <div className="col-md-6 mb-3">
            <label htmlFor="firstName">Prénom</label>
            <input
              type="text"
              className="form-control"
              id="firstName"
              name="firstName"
              value={firstName}
              onChange={onChange}
              required
            />
          </div>
          <div className="col-md-6 mb-3">
            <label htmlFor="lastName">Nom</label>
            <input
              type="text"
              className="form-control"
              id="lastName"
              name="lastName"
              value={lastName}
              onChange={onChange}
              required
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              className="form-control"
              id="email"
              name="email"
              value={email}
              onChange={onChange}
              required
            />
          </div>
          <div className="col-md-6 mb-3">
            <label htmlFor="phone">Téléphone</label>
            <input
              type="tel"
              className="form-control"
              id="phone"
              name="phone"
              value={phone}
              onChange={onChange}
              required
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label htmlFor="hotel">Hôtel</label>
            <select
              className="form-control"
              id="hotel"
              name="hotel"
              value={hotel}
              onChange={onChange}
              required
            >
              <option value="">Choisir un hôtel</option>
              <option value="1">Grand Hôtel Paris</option>
              <option value="2">Résidence Marseille</option>
            </select>
          </div>
          <div className="col-md-6 mb-3">
            <label htmlFor="roomType">Type de chambre</label>
            <select
              className="form-control"
              id="roomType"
              name="roomType"
              value={roomType}
              onChange={onChange}
              required
            >
              <option value="">Choisir un type</option>
              <option value="single">Simple</option>
              <option value="double">Double</option>
              <option value="suite">Suite</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label htmlFor="arrivalDate">Date d'arrivée</label>
            <input
              type="date"
              className="form-control"
              id="arrivalDate"
              name="arrivalDate"
              value={arrivalDate}
              onChange={onChange}
              required
            />
          </div>
          <div className="col-md-6 mb-3">
            <label htmlFor="departureDate">Date de départ</label>
            <input
              type="date"
              className="form-control"
              id="departureDate"
              name="departureDate"
              value={departureDate}
              onChange={onChange}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary mt-3">Enregistrer</button>
      </form>
    </div>
  );
};

export default GuestRegistration;
