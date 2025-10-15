# Northwind Database Seed

Classic Northwind traders sample database for PostgreSQL.

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
psql -h localhost -p 5432 -U northwind_user -d northwind
# Password: northwind_pass
```

Stop the database:
```bash
docker-compose down
```

## Connection Details

- **Host**: localhost
- **Port**: 5432
- **Database**: northwind
- **User**: northwind_user
- **Password**: northwind_pass

## Schema Overview

### Tables (13)
- `categories` - Product categories
- `suppliers` - Product suppliers
- `products` - Products inventory
- `customers` - Customer information (contains PII)
- `employees` - Employee records (contains PII)
- `orders` - Customer orders
- `order_details` - Order line items

### Sample Queries

List all products:
```sql
SELECT * FROM products;
```

Customer orders:
```sql
SELECT c.company_name, o.order_id, o.order_date, o.ship_city
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id;
```

Order totals:
```sql
SELECT o.order_id,
       SUM(od.unit_price * od.quantity * (1 - od.discount)) as total
FROM orders o
JOIN order_details od ON o.order_id = od.order_id
GROUP BY o.order_id;
```

## Using with OSS Protocols

Import the database schema:
```bash
protocol-discover import postgres \
  --host localhost \
  --port 5432 \
  --database northwind \
  --user northwind_user \
  --password northwind_pass
```

This will discover 13 table protocols with PII fields in customers and employees tables.
