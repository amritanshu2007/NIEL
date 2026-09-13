'use strict';

/**
 * Multimodal Logistics - HTTP controllers.
 * Writes to the transport graph are admin-only; route planning and plan
 * history are available to every authenticated role.
 */

const model = require('./model');
const service = require('./service');
const {
  validateNode,
  validateEdge,
  validateRouteRequest,
  OPERATIONAL_STATUSES,
  ACCESSIBILITY_STATUSES,
  WEIGHT_KEYS,
  MODES,
  NODE_TYPES,
  CARGO_TYPES,
} = require('./validation');

function bad(res, message) {
  return res.status(400).json({ error: message });
}

async function listNodes(req, res) {
  const { nodeType, operationalStatus, limit = 500, offset = 0 } = req.query;
  const rows = await model.listNodes({
    nodeType: nodeType || undefined,
    operationalStatus: operationalStatus || undefined,
    includeInactive: true,
    limit: Math.min(Number(limit) || 500, 1000),
    offset: Number(offset) || 0,
  });
  res.json({ nodes: rows });
}

async function createNode(req, res) {
  const v = validateNode(req.body);
  if (!v.ok) return bad(res, v.error);
  const row = await model.createNode(v.normalized);
  res.status(201).json({ node: row });
}

async function updateNode(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return bad(res, 'invalid node id');
  const existing = await model.getNode(id);
  if (!existing) return res.status(404).json({ error: 'node not found' });

  const v = validateNode({ ...existing, ...req.body, nodeType: req.body.nodeType || existing.nodeType });
  if (!v.ok) return bad(res, v.error);

  const row = await model.updateNode(id, {
    ...(req.body.name !== undefined ? { name: v.normalized.name } : {}),
    ...(req.body.nodeType !== undefined ? { nodeType: v.normalized.nodeType } : {}),
    ...(req.body.latitude !== undefined || req.body.longitude !== undefined ? { latitude: v.normalized.latitude, longitude: v.normalized.longitude } : {}),
    ...(req.body.capacity !== undefined ? { capacity: v.normalized.capacity } : {}),
    ...(req.body.operationalStatus !== undefined ? { operationalStatus: v.normalized.operationalStatus } : {}),
    ...(req.body.metadata !== undefined ? { metadata: v.normalized.metadata } : {}),
  });
  res.json({ node: row });
}

async function deleteNode(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return bad(res, 'invalid node id');
  const ok = await model.deleteNode(id);
  if (!ok) return res.status(404).json({ error: 'node not found' });
  res.json({ deleted: true, id });
}

async function listEdges(req, res) {
  const { mode, accessibilityStatus, limit = 500, offset = 0 } = req.query;
  const rows = await model.listEdges({
    mode: mode || undefined,
    accessibilityStatus: accessibilityStatus || undefined,
    includeBlocked: true,
    limit: Math.min(Number(limit) || 500, 1000),
    offset: Number(offset) || 0,
  });
  res.json({ edges: rows });
}

async function createEdge(req, res) {
  const v = validateEdge(req.body);
  if (!v.ok) return bad(res, v.error);
  const row = await model.createEdge(v.normalized);
  res.status(201).json({ edge: row });
}

async function updateEdge(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return bad(res, 'invalid edge id');
  const existing = await model.getEdge(id);
  if (!existing) return res.status(404).json({ error: 'edge not found' });

  const v = validateEdge({ ...existing, ...req.body, mode: req.body.mode || existing.mode });
  if (!v.ok) return bad(res, v.error);

  const row = await model.updateEdge(id, {
    ...(req.body.fromNodeId !== undefined ? { fromNodeId: v.normalized.fromNodeId } : {}),
    ...(req.body.toNodeId !== undefined ? { toNodeId: v.normalized.toNodeId } : {}),
    ...(req.body.mode !== undefined ? { mode: v.normalized.mode } : {}),
    ...(req.body.distanceKm !== undefined ? { distanceKm: v.normalized.distanceKm } : {}),
    ...(req.body.estimatedTimeMin !== undefined ? { estimatedTimeMin: v.normalized.estimatedTimeMin } : {}),
    ...(req.body.estimatedCostInr !== undefined ? { estimatedCostInr: v.normalized.estimatedCostInr } : {}),
    ...(req.body.capacity !== undefined ? { capacity: v.normalized.capacity } : {}),
    ...(req.body.accessibilityStatus !== undefined ? { accessibilityStatus: v.normalized.accessibilityStatus } : {}),
    ...(req.body.riskScore !== undefined ? { riskScore: v.normalized.riskScore } : {}),
    ...(req.body.metadata !== undefined ? { metadata: v.normalized.metadata } : {}),
  });
  res.json({ edge: row });
}

async function deleteEdge(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return bad(res, 'invalid edge id');
  const ok = await model.deleteEdge(id);
  if (!ok) return res.status(404).json({ error: 'edge not found' });
  res.json({ deleted: true, id });
}

async function meta(req, res) {
  res.json({
    modes: MODES,
    nodeTypes: NODE_TYPES,
    operationalStatuses: OPERATIONAL_STATUSES,
    accessibilityStatuses: ACCESSIBILITY_STATUSES,
    weightKeys: WEIGHT_KEYS,
    cargoTypes: CARGO_TYPES,
    costFunction: 'total = time_weight*time + distance_weight*distance + risk_weight*risk + cost_weight*monetaryCost',
  });
}

async function planRoute(req, res) {
  const v = validateRouteRequest(req.body);
  if (!v.ok) return bad(res, v.error);

  const payload = await service.planRoute(v.normalized);
  const best = payload.options[0];

  let saved = null;
  if (req.user && req.user.id) {
    saved = await model.savePlan({
      createdBy: req.user.id,
      origin: payload.origin,
      destination: payload.destination,
      cargoType: v.normalized.cargoType,
      selectedProfile: best ? best.profile : (payload.fallback ? 'road-fallback' : null),
      totalDistanceKm: best ? best.totalDistanceKm : null,
      totalDurationMin: best ? best.totalDurationMin : null,
      estimatedCostInr: best ? best.totalCostInr : null,
      co2eKg: best ? best.totalCo2eKg : null,
      planData: payload,
    });
  }

  res.json({ plan: payload, savedPlanId: saved ? saved.id : null });
}

async function listPlans(req, res) {
  const admin = req.user && req.user.role === 'admin';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const rows = await model.listPlans({ userId: req.user && req.user.id, admin, limit, offset });
  res.json({ plans: rows });
}

async function getPlan(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return bad(res, 'invalid plan id');
  const plan = await model.getPlan(id);
  if (!plan) return res.status(404).json({ error: 'plan not found' });
  if (req.user && req.user.role !== 'admin' && plan.created_by && req.user.id && Number(plan.created_by) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json({ plan });
}

module.exports = {
  listNodes,
  createNode,
  updateNode,
  deleteNode,
  listEdges,
  createEdge,
  updateEdge,
  deleteEdge,
  meta,
  planRoute,
  listPlans,
  getPlan,
};