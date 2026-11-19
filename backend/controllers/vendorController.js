import {
  createVendor,
  deleteVendor,
  listVendors,
  updateVendor
} from '../services/firebaseService.js';

export async function listVendorsHandler(req, res, next) {
  try {
    const vendors = await listVendors(req.user.uid, req.params.eventId);
    return res.json({ vendors });
  } catch (err) {
    return next(err);
  }
}

export async function createVendorHandler(req, res, next) {
  try {
    const vendor = await createVendor(req.user.uid, req.params.eventId, req.body);
    return res.status(201).json({ vendor });
  } catch (err) {
    return next(err);
  }
}

export async function updateVendorHandler(req, res, next) {
  try {
    const vendor = await updateVendor(req.user.uid, req.params.eventId, req.params.vendorId, req.body);
    return res.json({ vendor });
  } catch (err) {
    return next(err);
  }
}

export async function deleteVendorHandler(req, res, next) {
  try {
    const result = await deleteVendor(req.user.uid, req.params.eventId, req.params.vendorId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
