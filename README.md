# Kafeel (The Syndicate)

Institutional-grade financial infrastructure for the Bahraini market, featuring advanced credit scoring through Bayesian Probability Models and automated Salary-Day Sweep functionality.

## Overview

Kafeel is a comprehensive fintech platform designed for the Bahraini market that provides:

- **Reliability Index**: Bayesian Probability Model for advanced credit scoring
- **Salary-Day Sweep**: Automated fund sweeping for bill management
- **Bill Stack**: Complete bill payment automation and management
- **Bahrain e-Key Integration**: Secure identity verification
- **CBB Open Banking Compliance**: Full regulatory compliance

## Architecture

### Core Components

1. **Reliability Index Engine**
   - Bayesian Probability Model for credit scoring
   - Multi-factor analysis (payment history, income stability, employment, debt-to-income)
   - Market-level adjustments and confidence scoring

2. **Salary-Day Sweep System**
   - Automated fund sweeping based on salary cycles
   - Configurable sweep percentages and limits
   - Integration with Bahrain banking infrastructure

3. **Bill Management Stack**
   - Comprehensive bill tracking and management
   - Automated payment processing
   - Priority-based payment scheduling

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL with Knex.js ORM
- **Security**: JWT authentication, bcrypt password hashing
- **Scheduling**: Node-cron for automated processes
- **Compliance**: Bahrain CBB Open Banking standards

## Database Schema

The application uses a comprehensive database schema with the following core tables:

- `users`: User profiles and financial information
- `reliability_scores`: Bayesian credit scoring data
- `bills`: Bill management and payment tracking
- `sweep_configurations`: Salary-Day sweep settings
- `sweep_transactions`: Sweep execution records
- `bill_payments`: Bill payment history
- `audit_logs`: Compliance and security logging

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Token verification

### Reliability Index
- `GET /api/reliability/score/:userId` - Get user's reliability score
- `GET /api/reliability/history/:userId` - Get score history
- `GET /api/reliability/market-stats` - Market statistics (admin)

### Bill Management
- `GET /api/bills` - Get user's bills
- `POST /api/bills` - Create new bill
- `GET /api/bills/:id` - Get specific bill
- `PUT /api/bills/:id` - Update bill
- `DELETE /api/bills/:id` - Deactivate bill
- `GET /api/bills/upcoming/30days` - Get upcoming bills

### Salary-Day Sweep
- `POST /api/sweep/configure` - Create sweep configuration
- `GET /api/sweep/config` - Get sweep configuration
- `GET /api/sweep/transactions` - Get sweep transactions
- `GET /api/sweep/balance` - Get available sweep balance
- `PUT /api/sweep/config` - Update sweep configuration
- `DELETE /api/sweep/config` - Deactivate sweep

### Bahrain e-Key
- `POST /api/ekey/verify` - e-Key verification

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Set up the database:
   ```bash
   npm run migrate
   npm run seed
   ```

5. Start the application:
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## Environment Variables

Key environment variables required:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kafeel_prod
DB_USER=kafeel_user
DB_PASSWORD=secure_password

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Bahrain e-Key
EKEY_API_URL=https://api.bahrain.gov.bh/ekey
EKEY_CLIENT_ID=your_ekey_client_id
EKEY_CLIENT_SECRET=your_ekey_client_secret

# Open Banking
CBB_API_URL=https://api.cbb.gov.bh
CBB_CLIENT_ID=your_cbb_client_id
CBB_CLIENT_SECRET=your_cbb_client_secret
```

## Security Features

- JWT-based authentication
- bcrypt password hashing
- Rate limiting
- CORS protection
- Helmet.js security headers
- Comprehensive audit logging
- Data residency compliance (Bahrain PDPL)

## Compliance

The platform is designed to comply with:

- **Bahrain CBB Open Banking** (AISP/PISP standards)
- **Bahrain PDPL** (Personal Data Protection Law)
- **Data residency requirements**
- **Financial services regulations**

## Reliability Index Algorithm

The Bayesian Probability Model considers:

1. **Payment History (35%)**: On-time payment rate with logistic curve scoring
2. **Income Stability (25%)**: Salary consistency analysis using coefficient of variation
3. **Employment History (20%)**: Employment status and duration scoring
4. **Debt-to-Income Ratio (20%)**: Financial health assessment

The model applies Bayesian adjustments using:
- Market-level reliability data
- User segment comparisons
- Economic and seasonal factors
- Confidence scoring based on data points

## Salary-Day Sweep Logic

The sweep system:

1. **Calculates sweep amount** based on configured percentage and limits
2. **Executes bank sweeps** on scheduled dates before salary arrival
3. **Processes bill payments** automatically from sweep balance
4. **Maintains transaction history** for audit and compliance

## Monitoring and Logging

- Winston-based structured logging
- Comprehensive audit trail
- Error tracking and reporting
- Performance monitoring
- Security event logging

## Contributing

This is a proprietary financial infrastructure project. All contributions must comply with Bahrain financial regulations and security standards.

## License

Proprietary - All rights reserved.

## Support

For technical support and inquiries, please contact the Kafeel development team.
