# Sakila Database Seed

DVD rental store sample database for PostgreSQL.

## Quick Start

Start the database:
```bash
docker-compose up -d
```

Check status:
```bash
docker-compose ps
```

Connect to database:
```bash
psql -h localhost -p 5433 -U sakila_user -d sakila
# Password: sakila_pass
```

Stop the database:
```bash
docker-compose down
```

## Connection Details

- **Host**: localhost
- **Port**: 5433 (different from Northwind to avoid conflicts)
- **Database**: sakila
- **User**: sakila_user
- **Password**: sakila_pass

## Schema Overview

### Tables (16)
- `actor` - Film actors
- `film` - Film catalog
- `film_actor` - Actor-film relationships
- `film_category` - Film categories
- `category` - Category definitions
- `language` - Film languages
- `customer` - Customer information (contains PII)
- `staff` - Staff members (contains PII)
- `store` - Store locations
- `inventory` - Film inventory
- `rental` - Rental transactions
- `payment` - Payment records
- `address` - Addresses (contains PII)
- `city` - Cities
- `country` - Countries

### Sample Queries

List all films:
```sql
SELECT * FROM film;
```

Customer rental history:
```sql
SELECT c.first_name, c.last_name, f.title, r.rental_date, r.return_date
FROM customer c
JOIN rental r ON c.customer_id = r.customer_id
JOIN inventory i ON r.inventory_id = i.inventory_id
JOIN film f ON i.film_id = f.film_id;
```

Revenue by film:
```sql
SELECT f.title, SUM(p.amount) as total_revenue
FROM film f
JOIN inventory i ON f.film_id = i.film_id
JOIN rental r ON i.inventory_id = r.inventory_id
JOIN payment p ON r.rental_id = p.rental_id
GROUP BY f.title
ORDER BY total_revenue DESC;
```

## Using with OSS Protocols

Import the database schema:
```bash
protocol-discover import postgres \
  --host localhost \
  --port 5433 \
  --database sakila \
  --user sakila_user \
  --password sakila_pass
```

This will discover 16 table protocols with PII fields in customer, staff, and address tables.
