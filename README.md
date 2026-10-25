# Toll Plaza Ledger

**Automated Toll Plaza & RFID Vehicle Movement Ledger**
DBMS Experiential Learning, Level 3 Project (PES University)

A web application that processes RFID toll payments, keeps a financial ledger, and tracks vehicle movement across a highway network.

## Team

| Name | SRN | Main responsibilities |
|---|---|---|
|Sriya Dasari | PES2UG24CS522 | _e.g. MySQL schema, procedures, triggers, toll API_ |
|Srotaswini Das | PES2UG24CS525 | _e.g. Next.js interface, Neo4j queries, documentation_ |

## Why two databases

| Data | Database | Reason |
|---|---|---|
| Owners, vehicles, tags, balances, lanes, transactions, users | **MySQL** | Structured data that needs ACID transactions, foreign keys and constraints (a toll deduction and its ledger entry must succeed or fail together). |
| Plaza network and vehicle journeys | **Neo4j** | Connected data. Route finding and impossible-travel detection are path queries, which are direct traversals in a graph but need recursive self-joins in SQL. |

MySQL is the source of truth. After each toll transaction the API records the journey in Neo4j.

## Tech stack

- Frontend and API: Next.js (App Router, Route Handlers), Tailwind CSS
- SQL database: MySQL 8
- Graph database: Neo4j
- Authentication: bcrypt password hashing, JWT session cookie, roles Admin and Staff

## Features

- Role-based login (Admin, Staff)
- Toll processing through the `process_toll` stored procedure (transaction with row locking)
- Triggers: auto-block a tag at zero balance, audit log of balance changes
- Views, function, indexes, full-text search, CHECK/UNIQUE/FOREIGN KEY constraints
- Neo4j: vehicle journey trace, shortest route, suspicious movement detection

## Setup

### Prerequisites

- Node.js 20 or newer
- MySQL 8 and MySQL Workbench
- Neo4j Desktop

### 1. Clone and install

```
git clone <repository-url>
cd toll-plaza-app
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in your own values. Never commit `.env.local`.

```
copy .env.example .env.local
```

### 3. MySQL

Open `database/toll_plaza_complete.sql` in MySQL Workbench, select all, and run it with Execute All. It drops and recreates the `toll_plaza_ledger` database, then creates the tables, views, procedures, triggers and sample data.

### 4. Neo4j

1. In Neo4j Desktop create an instance named `toll-plaza`, set a password, and start it.
2. Open Query and run the statements in `database/toll_plaza_neo4j.cypher` one section at a time, in order (skip section 0 on a fresh instance).
3. Check: `MATCH (n) RETURN labels(n), count(*)` should show Plaza 5 and Vehicle 6.

### 5. Demo users

```
node --env-file=.env.local scripts/set-passwords.mjs
```

| Username | Password | Role |
|---|---|---|
| admin | password123 | Admin |
| ramesh | Ramesh@2026 | Staff |
| suresh | Suresh@2026 | Staff |

### 6. Run

```
npm run dev
```

Open http://localhost:3000 and check http://localhost:3000/api/health (both databases should report `ok: true`).

## Project structure

```
app/                 pages and API route handlers
  api/auth/          login, logout, current user
  api/toll/          toll processing endpoints
  dashboard/         protected pages
lib/                 mysql.js, neo4j.js, auth.js
components/          shared React components
database/            SQL and Cypher scripts
scripts/             helper scripts
```

## Documentation

ER diagram, relational schema, data dictionary, queries, screenshots and test results are in the project report.
