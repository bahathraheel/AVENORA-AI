import express from 'express';
import {
  createVendorHandler,
  deleteVendorHandler,
  listVendorsHandler,
  updateVendorHandler
} from '../controllers/vendorController.js';

const router = express.Router({ mergeParams: true });

router.get('/', listVendorsHandler);
router.post('/', createVendorHandler);
router.put('/:vendorId', updateVendorHandler);
router.delete('/:vendorId', deleteVendorHandler);

export default router;
