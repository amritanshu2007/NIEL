'use strict';

/**
 * Real-time layer.
 * Rooms are grouped per district so transport officers / field staff
 * only receive events relevant to their area.
 */

module.exports = function setupSockets(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // e.g. {"district": "Kamrup"}
    socket.on('join-district', (data) => {
      if (data && data.district) {
        socket.join(`district:${data.district}`);
        socket.emit('joined', { district: data.district });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // Broadcast helpers exposed to controllers
  return {
    emitIncident(ioRef, incident) {
      ioRef.emit('incident:new', incident);
    },
    emitVehicleUpdate(ioRef, vehicle) {
      ioRef.emit('vehicle:update', vehicle);
    },
    emitRoadStatus(ioRef, road) {
      if (road.district) {
        ioRef.to(`district:${road.district}`).emit('road:status', road);
      } else {
        ioRef.emit('road:status', road);
      }
    },
  };
};