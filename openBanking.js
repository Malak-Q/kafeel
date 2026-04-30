const logger = require('../utils/logger');

class OpenBankingService {
  /**
   * Digital Shovel - AISP Integration Service
   * Simulates Tarabut Gateway FAPI-compliant connection
   */

  static async initiateBankConnection(userId, bankCode) {
    try {
      logger.info(`Initiating bank connection for user ${userId} with bank ${bankCode}`);
      
      // Simulate FAPI handshake
      const connectionResponse = await this.simulateTarabutHandshake(userId, bankCode);
      
      if (connectionResponse.success) {
        // Fetch raw transaction data
        const rawTransactions = await this.fetchRawTransactions(connectionResponse.sessionId);
        
        // Classify and process transactions
        const classifiedTransactions = await this.classifyTransactions(rawTransactions);
        
        // Store in database
        await this.storeTransactions(userId, classifiedTransactions);
        
        // Trigger reliability scoring
        await this.triggerScoring(userId);
        
        return {
          success: true,
          transactionsProcessed: classifiedTransactions.length,
          sessionId: connectionResponse.sessionId
        };
      } else {
        throw new Error('Bank connection failed');
      }
      
    } catch (error) {
      logger.error('Open Banking connection error:', error);
      throw error;
    }
  }

  static async simulateTarabutHandshake(userId, bankCode) {
    try {
      logger.info(`Simulating Tarabut Gateway handshake for ${bankCode}`);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock successful handshake
      const sessionId = `TB_${bankCode}_${userId}_${Date.now()}`;
      
      return {
        success: true,
        sessionId: sessionId,
        bankCode: bankCode,
        consentId: `CONSENT_${sessionId}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      };
      
    } catch (error) {
      logger.error('Tarabut handshake simulation error:', error);
      return { success: false, error: error.message };
    }
  }

  static async fetchRawTransactions(sessionId) {
    try {
      logger.info(`Fetching raw transactions for session ${sessionId}`);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock raw transaction data (simulating real bank API responses)
      const rawTransactions = [
        // Utility transactions
        'TRNSFR EWA 102293 AMT 45.000 BHD 2024-03-15',
        'TRNSFR EWA 102294 AMT 45.000 BHD 2024-02-15',
        'TRNSFR EWA 102295 AMT 45.000 BHD 2024-01-15',
        'TRNSFR EWA 102296 AMT 45.000 BHD 2023-12-15',
        
        // Telecom transactions
        'POS STC BH AMT 25.000 BHD 2024-03-10',
        'POS STC BH AMT 25.000 BHD 2024-02-10',
        'POS BATELCO BH AMT 30.000 BHD 2024-01-10',
        
        // Rent transactions
        'STANDING ORDER RENT AMT 500.000 BHD 2024-03-01',
        'STANDING ORDER RENT AMT 500.000 BHD 2024-02-01',
        'STANDING ORDER RENT AMT 500.000 BHD 2024-01-01',
        
        // School fees
        'TRNSFR BAHRAIN SCHOOL AMT 300.000 BHD 2024-03-05',
        'TRNSFR BAHRAIN SCHOOL AMT 300.000 BHD 2024-02-05',
        'TRNSFR BAHRAIN SCHOOL AMT 300.000 BHD 2024-01-05',
        
        // Salary credits
        'CREDIT SALARY AMT 1200.000 BHD 2024-03-25',
        'CREDIT SALARY AMT 1200.000 BHD 2024-02-25',
        'CREDIT SALARY AMT 1200.000 BHD 2024-01-25',
        
        // Other transactions
        'POS LULU HYPERMARKET AMT 85.500 BHD 2024-03-20',
        'POS JARIR BOOKSTORE AMT 12.750 BHD 2024-03-18',
        'TRNSFR TRANSFER AMT 150.000 BHD 2024-03-12'
      ];
      
      logger.info(`Retrieved ${rawTransactions.length} raw transactions`);
      return rawTransactions;
      
    } catch (error) {
      logger.error('Transaction fetch error:', error);
      throw error;
    }
  }

  static async classifyTransactions(rawTransactions) {
    try {
      logger.info('Classifying transactions using regex engine');
      
      const classifiedTransactions = [];
      const classificationRules = [
        // Utility classification
        {
          pattern: /EWA/i,
          category: 'utility',
          provider: 'EWA Bahrain',
          billType: 'utility',
          frequency: 'monthly'
        },
        
        // Telecom classification
        {
          pattern: /STC|BATELCO/i,
          category: 'telecom',
          provider: (match) => match.includes('STC') ? 'STC Bahrain' : 'Batelco Bahrain',
          billType: 'subscription',
          frequency: 'monthly'
        },
        
        // Rent classification
        {
          pattern: /STANDING ORDER.*RENT/i,
          category: 'housing',
          provider: 'Almoayyed Tower',
          billType: 'rent',
          frequency: 'monthly'
        },
        
        // Education classification
        {
          pattern: /BAHRAIN SCHOOL/i,
          category: 'education',
          provider: 'Bahrain School',
          billType: 'subscription',
          frequency: 'monthly'
        },
        
        // Salary classification
        {
          pattern: /CREDIT.*SALARY/i,
          category: 'income',
          provider: 'Bahrain Islamic Bank',
          billType: null,
          frequency: 'monthly'
        }
      ];

      for (const rawTransaction of rawTransactions) {
        let classified = {
          raw: rawTransaction,
          category: 'other',
          provider: 'Unknown',
          billType: null,
          frequency: null,
          amount: 0,
          date: null,
          description: rawTransaction
        };

        // Extract amount using regex
        const amountMatch = rawTransaction.match(/AMT\s+([\d.]+)\s+BHD/i);
        if (amountMatch) {
          classified.amount = parseFloat(amountMatch[1]);
        }

        // Extract date using regex
        const dateMatch = rawTransaction.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          classified.date = dateMatch[1];
        }

        // Apply classification rules
        for (const rule of classificationRules) {
          if (rule.pattern.test(rawTransaction)) {
            classified.category = rule.category;
            classified.provider = typeof rule.provider === 'function' 
              ? rule.provider(rawTransaction) 
              : rule.provider;
            classified.billType = rule.billType;
            classified.frequency = rule.frequency;
            break;
          }
        }

        classifiedTransactions.push(classified);
      }

      logger.info(`Classified ${classifiedTransactions.length} transactions`);
      return classifiedTransactions;
      
    } catch (error) {
      logger.error('Transaction classification error:', error);
      throw error;
    }
  }

  static async storeTransactions(userId, classifiedTransactions) {
    try {
      const db = require('../database/connection');
      
      // Group transactions by provider for bill creation
      const billGroups = {};
      const paymentHistory = [];
      
      for (const transaction of classifiedTransactions) {
        if (transaction.billType && transaction.amount > 0) {
          // Group for bill creation
          const key = `${transaction.provider}_${transaction.billType}`;
          if (!billGroups[key]) {
            billGroups[key] = {
              user_id: userId,
              bill_type: transaction.billType,
              provider_name: transaction.provider,
              amount_due: transaction.amount,
              minimum_payment: transaction.amount,
              due_date: this.calculateDueDate(transaction.date, transaction.billType),
              frequency: transaction.frequency,
              is_autopay_enabled: true,
              is_active: true,
              priority_level: this.getPriorityLevel(transaction.billType),
              notes: `Auto-classified from: ${transaction.raw}`
            };
          }
          
          // Add to payment history
          paymentHistory.push({
            user_id: userId,
            transaction_reference: `OB_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            amount: transaction.amount,
            date: transaction.date,
            category: transaction.category,
            provider: transaction.provider,
            raw_transaction: transaction.raw
          });
        }
      }

      // Insert bills
      const insertedBills = [];
      for (const billData of Object.values(billGroups)) {
        try {
          const [bill] = await db('bills').insert(billData).returning('*');
          insertedBills.push(bill);
        } catch (error) {
          // Handle duplicate bills
          if (error.code === 'SQLITE_CONSTRAINT') {
            logger.warn(`Bill already exists for ${billData.provider_name}`);
          } else {
            throw error;
          }
        }
      }

      // Store payment history
      for (const payment of paymentHistory) {
        await db('audit_logs').insert({
          user_id: userId,
          action: 'transaction_import',
          resource_type: 'transaction',
          new_values: payment,
          ip_address: '127.0.0.1',
          user_agent: 'OpenBankingService/1.0',
          created_at: new Date()
        });
      }

      logger.info(`Stored ${insertedBills.length} bills and ${paymentHistory.length} transactions`);
      return { bills: insertedBills, payments: paymentHistory };
      
    } catch (error) {
      logger.error('Transaction storage error:', error);
      throw error;
    }
  }

  static async triggerScoring(userId) {
    try {
      logger.info(`Triggering reliability scoring for user ${userId}`);
      
      const ReliabilityIndex = require('../models/ReliabilityIndex');
      
      // Calculate reliability index
      const scoreResult = await ReliabilityIndex.calculateReliabilityScore(userId);
      
      logger.info(`Score calculation completed: ${scoreResult.reliabilityScore}`);
      
      return scoreResult;
      
    } catch (error) {
      logger.error('Scoring trigger error:', error);
      throw error;
    }
  }

  static calculateDueDate(dateString, billType) {
    try {
      const date = new Date(dateString);
      const currentMonth = date.getMonth();
      const currentYear = date.getFullYear();
      
      // Set next month's due date based on bill type
      const dueDates = {
        'utility': 15,    // EWA due 15th
        'rent': 1,        // Rent due 1st
        'subscription': 10 // School due 10th
      };
      
      const dueDay = dueDates[billType] || 15;
      return new Date(currentYear, currentMonth + 1, dueDay);
      
    } catch (error) {
      // Default to 15th of next month
      const defaultDate = new Date();
      return new Date(defaultDate.getFullYear(), defaultDate.getMonth() + 1, 15);
    }
  }

  static getPriorityLevel(billType) {
    const priorities = {
      'rent': 1,        // High priority
      'utility': 1,    // High priority
      'subscription': 2, // Medium priority
      'telecom': 2     // Medium priority
    };
    
    return priorities[billType] || 3; // Default to low priority
  }

  static async getSupportedBanks() {
    return [
      {
        code: 'BBK',
        name: 'Bahrain Islamic Bank',
        status: 'active',
        features: ['full_api', 'real_time', 'historical_data']
      },
      {
        code: 'NBB',
        name: 'National Bank of Bahrain',
        status: 'coming_soon',
        features: ['full_api', 'real_time']
      },
      {
        code: 'AB',
        name: 'Ahli United Bank',
        status: 'coming_soon',
        features: ['full_api']
      }
    ];
  }
}

module.exports = OpenBankingService;
