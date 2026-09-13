'use strict';

const vehicleModel = require('../models/vehicleModel');
const wrap = require('../utils/wrap');

// POST /api/vehicles/register - register a vehicle with an initial GPS point
const registerVehicle = wrap(async (req, res) => {
  const {
    vehicle_number,
    driver_name,
    phone,
    cargo_type,
    destination,
    location,
    lat,
    lng,
    status = 'IN_TRANSIT',
  } = req.body;

  // Accept either location { lat, lng } or flat lat/lng fields
  const latVal = lat ?? location?.lat;
  const lngVal = lng ?? location?.lng;

  if (!vehicle_number || !driver_name || !phone || !cargo_type || !destination) {
    return res.status(400).json({
      error: 'vehicle_number, driver_name, phone, cargo_type, destination and location are required',
    });
  }

  const latNum = Number(latVal);
  const lngNum = Number(lngVal);

  if (
    Number.isNaN(latNum) || Number.isNaN(lngNum) ||
    latNum < -90 || latNum > 90 ||
    lngNum < -180 || lngNum > 180
  ) {
    return res.status(400).json({
      error: 'location must include lat in [-90, 90] and lng in [-180, 180]',
    });
  }

  if (!vehicleModel.CARGOS.includes(cargo_type)) {
    return res.status(400).json({
      error: `cargo_type must be one of: ${vehicleModel.CARGOS.join(', ')}`,
    });
  }

  if (!vehicleModel.VEHICLE_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${vehicleModel.VEHICLE_STATUSES.join(', ')}`,
    });
  }

  try {
    const vehicle = await vehicleModel.registerVehicle({
      vehicleNumber: vehicle_number.trim(),
      driverName: driver_name.trim(),
      phone: phone.trim(),
      cargoType: cargo_type,
      lng: lngNum,
      lat: latNum,
      destination: destination.trim(),
      status,
    });
    return res.status(201).json(vehicle);
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'vehicles_vehicle_number_key') {
      return res.status(409).json({ error: 'Vehicle number already registered' });
    }
    throw err;
  }
});

// POST /api/vehicles/location - update live GPS, broadcast to all clients
const updateLocation = wrap(async (req, res) => {
  const { vehicle_number, location, lat, lng, status } = req.body;

  if (!vehicle_number) {
    return res.status(400).json({ error: 'vehicle_number is required' });
  }

  const latVal = lat ?? location?.lat;
  const lngVal = lng ?? location?.lng;

  if (latVal === undefined || lngVal === undefined) {
    return res.status(400).json({ error: 'location { lat, lng } is required' });
  }

  const latNum = Number(latVal);
  const lngNum = Number(lngVal);

  if (
    Number.isNaN(latNum) || Number.isNaN(lngNum) ||
    latNum < -90 || latNum > 90 ||
    lngNum < -180 || lngNum > 180
  ) {
    return res.status(400).json({
      error: 'location must include lat in [-90, 90] and lng in [-180, 180]',
    });
  }

  if (status !== undefined && !vehicleModel.VEHICLE_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${vehicleModel.VEHICLE_STATUSES.join(', ')}`,
    });
  }

  const vehicle = await vehicleModel.updateLocation({
    vehicleNumber: vehicle_number,
    lng: lngNum,
    lat: latNum,
    status,
  });

  if (!vehicle) {
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  // Real-time live tracking broadcast to all connected clients
  req.app.get('io').emit('vehicle:location', vehicle);

  return res.json(vehicle);
});

// GET /api/vehicles - fleet status dashboard (optional ?status, ?cargo_type filters)
const listVehicles = wrap(async (req, res) => {
  const { status, cargo_type } = req.query;

  if (status && !vehicleModel.VEHICLE_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${vehicleModel.VEHICLE_STATUSES.join(', ')}`,
    });
  }
  if (cargo_type && !vehicleModel.CARGOS.includes(cargo_type)) {
    return res.status(400).json({
      error: `cargo_type must be one of: ${vehicleModel.CARGOS.join(', ')}`,
    });
  }

  const vehicles = await vehicleModel.listVehicles({ status, cargoType: cargo_type });
  return res.json(vehicles);
});

module.exports = { registerVehicle, updateLocation, listVehicles };