const express = require('express');
const router = express.Router();
const Joi = require('joi');
const axios = require('axios');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

// Validation schema
const ekeyVerifySchema = Joi.object({
  cpr_number: Joi.string().length(10).pattern(/^\d+$/).required(),
  verification_code: Joi.string().length(6).pattern(/^\d+$/).required(),
  transaction_id: Joi.string().uuid().optional()
});

// Bahrain e-Key integration
router.post('/verify', auth, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = ekeyVerifySchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { cpr_number, verification_code, transaction_id } = value;
    const userId = req.user.id;

    // Verify CPR belongs to authenticated user
    const db = require('../database/connection');
    const user = await db('users')
      .where('id', userId)
      .where('cpr_number', cpr_number)
      .first();

    if (!user) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'CPR number does not match authenticated user'
      });
    }

    // Call Bahrain iGA e-Key API
    const ekeyResponse = await callEKeyAPI({
      cpr_number,
      verification_code,
      transaction_id,
      client_id: process.env.EKEY_CLIENT_ID,
      client_secret: process.env.EKEY_CLIENT_SECRET
    });

    if (ekeyResponse.success) {
      // Update user verification status
      await db('users')
        .where('id', userId)
        .update({
          is_verified: true,
          updated_at: new Date()
        });

      // Log successful verification
      await db('audit_logs').insert({
        user_id: userId,
        action: 'ekey_verify',
        resource_type: 'user',
        resource_id: userId,
        new_values: { is_verified: true },
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        created_at: new Date()
      });

      logger.info(`e-Key verification successful for user ${userId}`);

      res.json({
        success: true,
        message: 'e-Key verification successful',
        data: {
          verified: true,
          verification_timestamp: ekeyResponse.timestamp,
          verification_id: ekeyResponse.verification_id
        }
      });

    } else {
      // Log failed verification attempt
      await db('audit_logs').insert({
        user_id: userId,
        action: 'ekey_verify_failed',
        resource_type: 'user',
        resource_id: userId,
        new_values: { 
          error_code: ekeyResponse.error_code,
          error_message: ekeyResponse.error_message 
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        created_at: new Date()
      });

      logger.warn(`e-Key verification failed for user ${userId}: ${ekeyResponse.error_message}`);

      res.status(400).json({
        success: false,
        error: 'e-Key verification failed',
        message: ekeyResponse.error_message,
        error_code: ekeyResponse.error_code
      });
    }

  } catch (error) {
    logger.error('e-Key verification error:', error);
    next(error);
  }
});

// Initiate e-Key verification
router.post('/initiate', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get user's CPR number
    const db = require('../database/connection');
    const user = await db('users')
      .where('id', userId)
      .first(['cpr_number']);

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Initiate e-Key verification process
    const initiationResponse = await callEKeyInitiationAPI({
      cpr_number: user.cpr_number,
      client_id: process.env.EKEY_CLIENT_ID,
      client_secret: process.env.EKEY_CLIENT_SECRET,
      callback_url: `${process.env.API_BASE_URL}/api/ekey/callback`
    });

    if (initiationResponse.success) {
      logger.info(`e-Key verification initiated for user ${userId}`);

      res.json({
        success: true,
        message: 'e-Key verification initiated',
        data: {
          transaction_id: initiationResponse.transaction_id,
          expires_at: initiationResponse.expires_at,
          verification_methods: initiationResponse.verification_methods
        }
      });

    } else {
      logger.error(`e-Key initiation failed for user ${userId}: ${initiationResponse.error_message}`);

      res.status(400).json({
        success: false,
        error: 'e-Key initiation failed',
        message: initiationResponse.error_message
      });
    }

  } catch (error) {
    logger.error('e-Key initiation error:', error);
    next(error);
  }
});

// e-Key callback endpoint (for iGA to call back)
router.post('/callback', async (req, res, next) => {
  try {
    const { transaction_id, status, cpr_number, verification_code } = req.body;

    // Log the callback
    logger.info(`e-Key callback received: transaction_id=${transaction_id}, status=${status}`);

    // In a real implementation, you would:
    // 1. Verify the callback signature
    // 2. Update the transaction status
    // 3. Notify the user via WebSocket or push notification

    res.status(200).send('OK');

  } catch (error) {
    logger.error('e-Key callback error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Mock e-Key API call (replace with actual implementation)
async function callEKeyAPI(data) {
  try {
    // This is a mock implementation
    // In production, this would call the actual Bahrain iGA e-Key API
    
    logger.info(`Mock e-Key API call for CPR: ${data.cpr_number}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock successful verification (in production, this would be the actual API response)
    if (data.verification_code === '123456') {
      return {
        success: true,
        verification_id: 'EK' + Date.now(),
        timestamp: new Date().toISOString(),
        cpr_number: data.cpr_number
      };
    } else {
      return {
        success: false,
        error_code: 'INVALID_CODE',
        error_message: 'Invalid verification code'
      };
    }

  } catch (error) {
    logger.error('e-Key API call error:', error);
    return {
      success: false,
      error_code: 'API_ERROR',
      error_message: 'Failed to connect to e-Key service'
    };
  }
}

// Mock e-Key initiation API call
async function callEKeyInitiationAPI(data) {
  try {
    // This is a mock implementation
    // In production, this would call the actual Bahrain iGA e-Key API
    
    logger.info(`Mock e-Key initiation API call for CPR: ${data.cpr_number}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock successful initiation
    return {
      success: true,
      transaction_id: 'TX' + Date.now(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
      verification_methods: ['sms', 'email', 'app']
    };

  } catch (error) {
    logger.error('e-Key initiation API call error:', error);
    return {
      success: false,
      error_code: 'API_ERROR',
      error_message: 'Failed to initiate e-Key verification'
    };
  }
}

module.exports = router;
