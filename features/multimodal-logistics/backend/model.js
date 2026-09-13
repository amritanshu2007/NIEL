'use strict';

/**
 * Multimodal Logistics - data access layer for the transport graph
 * (transport_nodes / transport_edges) plus persistence of computed route
 * plans on the existing shipment_plans ledger.
 */

const pool = require('../../../src/config/db');

const NODE_COLS = `id, name, node_type AS "nodeType",
  latitude::float8 AS lat, longitude::float8 AS lng,
  capacity, operational_status AS "operationalStatus", metadata,
  created_at, updated_at`;

const EDGE_COLS = `e.id, e.from_node_id AS "fromNodeId", e.to_node_id AS "toNodeId",
  e.mode, e.distance_km::float8 AS "distanceKm",
  e.estimated_time_min::float8 AS "estimatedTimeMin",
  e.estimated_cost_inr::float8 AS "estimatedCostInr",
  e.capacity, e.accessibility_status AS "accessibilityStatus",
  e.risk_score::float8 AS "riskScore", e.metadata,
  fn.name AS "fromName", fn.node_type AS "fromNodeType",
  tn.name AS "toName", tn.node_type AS "toNodeType",
  e.created_at, e.updated_at`;

// ---------------------------------------------------------------- nodes
async function listNodes({ nodeType, operationalStatus, includeInactive = false, limit = 500, offset = 0 } = {}) {
  const params = [];
  const conds = [];
  if (nodeType) {
    params.push(nodeType);
    conds.push(`node_type = $${params.length}`);
  }
  if (operationalStatus) {
    params.push(operationalStatus);
    conds.push(`operational_status = $${params.length}`);
  } else if (!includeInactive) {
    conds.push(`operational_status <> 'INACTIVE'`);
  }
  params.push(limit, offset);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ${NODE_COLS} FROM transport_nodes
      ${where}
     ORDER BY node_type, name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getNode(id) {
  const { rows } = await pool.query(`SELECT ${NODE_COLS} FROM transport_nodes WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function createNode({ name, nodeType, latitude, longitude, capacity, operationalStatus, metadata }) {
  const { rows } = await pool.query(
    `INSERT INTO transport_nodes
       (name, node_type, latitude, longitude, capacity, operational_status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${NODE_COLS}`,
    [name, nodeType, latitude, longitude, capacity, operationalStatus, metadata === null ? null : JSON.stringify(metadata)]
  );
  return rows[0];
}

async function updateNode(id, patch) {
  const fields = [];
  const params = [id];
  const push = (col, value) => {
    params.push(value);
    fields.push(`${col} = $${params.length}`);
  };
  if (patch.name !== undefined) push('name', patch.name);
  if (patch.nodeType !== undefined) push('node_type', patch.nodeType);
  if (patch.latitude !== undefined) push('latitude', patch.latitude);
  if (patch.longitude !== undefined) push('longitude', patch.longitude);
  if (patch.capacity !== undefined) push('capacity', patch.capacity);
  if (patch.operationalStatus !== undefined) push('operational_status', patch.operationalStatus);
  if (patch.metadata !== undefined) push('metadata', patch.metadata === null ? null : JSON.stringify(patch.metadata));
  if (!fields.length) return getNode(id);
  const { rows } = await pool.query(
    `UPDATE transport_nodes SET ${fields.join(', ')} WHERE id = $1 RETURNING ${NODE_COLS}`,
    params
  );
  return rows[0] || null;
}

async function deleteNode(id) {
  const { rows } = await pool.query(
    `DELETE FROM transport_nodes WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------- edges
async function listEdges({ mode, accessibilityStatus, includeBlocked = false, limit = 500, offset = 0 } = {}) {
  const params = [];
  const conds = [];
  if (mode) {
    params.push(mode);
    conds.push(`e.mode = $${params.length}`);
  }
  if (accessibilityStatus) {
    params.push(accessibilityStatus);
    conds.push(`e.accessibility_status = $${params.length}`);
  } else if (!includeBlocked) {
    conds.push(`e.accessibility_status <> 'BLOCKED'`);
  }
  params.push(limit, offset);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ${EDGE_COLS}
       FROM transport_edges e
       JOIN transport_nodes fn ON fn.id = e.from_node_id
       JOIN transport_nodes tn ON tn.id = e.to_node_id
      ${where}
     ORDER BY e.mode, e.id
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getEdge(id) {
  const { rows } = await pool.query(
    `SELECT ${EDGE_COLS}
       FROM transport_edges e
       JOIN transport_nodes fn ON fn.id = e.from_node_id
       JOIN transport_nodes tn ON tn.id = e.to_node_id
      WHERE e.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createEdge(values) {
  const { rows } = await pool.query(
    `INSERT INTO transport_edges
       (from_node_id, to_node_id, mode, distance_km, estimated_time_min,
        estimated_cost_inr, capacity, accessibility_status, risk_score, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      values.fromNodeId,
      values.toNodeId,
      values.mode,
      values.distanceKm,
      values.estimatedTimeMin,
      values.estimatedCostInr,
      values.capacity,
      values.accessibilityStatus,
      values.riskScore,
      values.metadata === null ? null : JSON.stringify(values.metadata),
    ]
  );
  return getEdge(rows[0].id);
}

async function updateEdge(id, patch) {
  const fields = [];
  const params = [id];
  const push = (col, value) => {
    params.push(value);
    fields.push(`${col} = $${params.length}`);
  };
  if (patch.fromNodeId !== undefined) push('from_node_id', patch.fromNodeId);
  if (patch.toNodeId !== undefined) push('to_node_id', patch.toNodeId);
  if (patch.mode !== undefined) push('mode', patch.mode);
  if (patch.distanceKm !== undefined) push('distance_km', patch.distanceKm);
  if (patch.estimatedTimeMin !== undefined) push('estimated_time_min', patch.estimatedTimeMin);
  if (patch.estimatedCostInr !== undefined) push('estimated_cost_inr', patch.estimatedCostInr);
  if (patch.capacity !== undefined) push('capacity', patch.capacity);
  if (patch.accessibilityStatus !== undefined) push('accessibility_status', patch.accessibilityStatus);
  if (patch.riskScore !== undefined) push('risk_score', patch.riskScore);
  if (patch.metadata !== undefined) push('metadata', patch.metadata === null ? null : JSON.stringify(patch.metadata));
  if (!fields.length) return getEdge(id);
  await pool.query(`UPDATE transport_edges SET ${fields.join(', ')} WHERE id = $1`, params);
  return getEdge(id);
}

async function deleteEdge(id) {
  const { rows } = await pool.query(`DELETE FROM transport_edges WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

/** Nodes eligible to take part in routing (ACTIVE + enough capacity). */
async function loadRoutingNodes(minCapacity = 0) {
  const params = [minCapacity];
  const { rows } = await pool.query(
    `SELECT ${NODE_COLS} FROM transport_nodes
      WHERE operational_status = 'ACTIVE' AND capacity >= $1`,
    params
  );
  return rows;
}

/** Open + capacity-sufficient edges between ACTIVE nodes. */
async function loadRoutingEdges(minCapacity = 0) {
  const params = [minCapacity];
  const { rows } = await pool.query(
    `SELECT ${EDGE_COLS}
       FROM transport_edges e
       JOIN transport_nodes fn ON fn.id = e.from_node_id
       JOIN transport_nodes tn ON tn.id = e.to_node_id
      WHERE e.capacity >= $1
        AND fn.operational_status = 'ACTIVE'
        AND tn.operational_status = 'ACTIVE'`,
    params
  );
  return rows;
}

// ---------------------------------------------------------------- plans
async function savePlan(plan) {
  const { createdBy, origin, destination, cargoType, selectedProfile, totalDistanceKm, totalDurationMin, estimatedCostInr, co2eKg, planData } = plan;
  const { rows } = await pool.query(
    `INSERT INTO shipment_plans
       (created_by, origin_name, origin_lng, origin_lat,
        destination_name, destination_lng, destination_lat,
        cargo_type, selected_profile, total_distance_km,
        total_duration_min, estimated_cost_inr, co2e_kg, plan_data, engine_source)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'multimodal-transportgraph')
     RETURNING *`,
    [
      createdBy,
      origin.name || null,
      origin.lng,
      origin.lat,
      destination.name || null,
      destination.lng,
      destination.lat,
      cargoType,
      selectedProfile,
      totalDistanceKm,
      totalDurationMin,
      estimatedCostInr,
      co2eKg,
      JSON.stringify(planData),
    ]
  );
  return rows[0];
}

async function listPlans({ userId, admin = false, limit = 50, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (!admin && userId) {
    params.push(userId);
    where = 'WHERE created_by = $1';
  }
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM shipment_plans
      ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getPlan(id) {
  const { rows } = await pool.query(`SELECT * FROM shipment_plans WHERE id = $1`, [id]);
  return rows[0] || null;
}

module.exports = {
  listNodes,
  getNode,
  createNode,
  updateNode,
  deleteNode,
  listEdges,
  getEdge,
  createEdge,
  updateEdge,
  deleteEdge,
  loadRoutingNodes,
  loadRoutingEdges,
  savePlan,
  listPlans,
  getPlan,
};