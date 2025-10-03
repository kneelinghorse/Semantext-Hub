-- Northwind Database Schema and Sample Data
-- Simplified version for demonstration purposes

-- Create tables
CREATE TABLE IF NOT EXISTS categories (
  category_id SERIAL PRIMARY KEY,
  category_name VARCHAR(15) NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id SERIAL PRIMARY KEY,
  company_name VARCHAR(40) NOT NULL,
  contact_name VARCHAR(30),
  contact_title VARCHAR(30),
  address VARCHAR(60),
  city VARCHAR(15),
  region VARCHAR(15),
  postal_code VARCHAR(10),
  country VARCHAR(15),
  phone VARCHAR(24)
);

CREATE TABLE IF NOT EXISTS products (
  product_id SERIAL PRIMARY KEY,
  product_name VARCHAR(40) NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(supplier_id),
  category_id INTEGER REFERENCES categories(category_id),
  quantity_per_unit VARCHAR(20),
  unit_price DECIMAL(10,2),
  units_in_stock SMALLINT,
  units_on_order SMALLINT,
  reorder_level SMALLINT,
  discontinued BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id VARCHAR(5) PRIMARY KEY,
  company_name VARCHAR(40) NOT NULL,
  contact_name VARCHAR(30),
  contact_title VARCHAR(30),
  address VARCHAR(60),
  city VARCHAR(15),
  region VARCHAR(15),
  postal_code VARCHAR(10),
  country VARCHAR(15),
  phone VARCHAR(24),
  fax VARCHAR(24)
);

CREATE TABLE IF NOT EXISTS employees (
  employee_id SERIAL PRIMARY KEY,
  last_name VARCHAR(20) NOT NULL,
  first_name VARCHAR(10) NOT NULL,
  title VARCHAR(30),
  title_of_courtesy VARCHAR(25),
  birth_date DATE,
  hire_date DATE,
  address VARCHAR(60),
  city VARCHAR(15),
  region VARCHAR(15),
  postal_code VARCHAR(10),
  country VARCHAR(15),
  home_phone VARCHAR(24),
  extension VARCHAR(4),
  notes TEXT,
  reports_to INTEGER REFERENCES employees(employee_id)
);

CREATE TABLE IF NOT EXISTS orders (
  order_id SERIAL PRIMARY KEY,
  customer_id VARCHAR(5) REFERENCES customers(customer_id),
  employee_id INTEGER REFERENCES employees(employee_id),
  order_date DATE,
  required_date DATE,
  shipped_date DATE,
  ship_via INTEGER,
  freight DECIMAL(10,2),
  ship_name VARCHAR(40),
  ship_address VARCHAR(60),
  ship_city VARCHAR(15),
  ship_region VARCHAR(15),
  ship_postal_code VARCHAR(10),
  ship_country VARCHAR(15)
);

CREATE TABLE IF NOT EXISTS order_details (
  order_id INTEGER REFERENCES orders(order_id),
  product_id INTEGER REFERENCES products(product_id),
  unit_price DECIMAL(10,2) NOT NULL,
  quantity SMALLINT NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, product_id)
);

-- Insert sample data
INSERT INTO categories (category_name, description) VALUES
  ('Beverages', 'Soft drinks, coffees, teas, beers, and ales'),
  ('Condiments', 'Sweet and savory sauces, relishes, spreads, and seasonings'),
  ('Confections', 'Desserts, candies, and sweet breads'),
  ('Dairy Products', 'Cheeses'),
  ('Grains/Cereals', 'Breads, crackers, pasta, and cereal');

INSERT INTO suppliers (company_name, contact_name, city, country, phone) VALUES
  ('Exotic Liquids', 'Charlotte Cooper', 'London', 'UK', '(171) 555-2222'),
  ('New Orleans Cajun Delights', 'Shelley Burke', 'New Orleans', 'USA', '(100) 555-4822'),
  ('Tokyo Traders', 'Yoshi Nagase', 'Tokyo', 'Japan', '(03) 3555-5011');

INSERT INTO products (product_name, supplier_id, category_id, unit_price, units_in_stock) VALUES
  ('Chai', 1, 1, 18.00, 39),
  ('Chang', 1, 1, 19.00, 17),
  ('Aniseed Syrup', 1, 2, 10.00, 13),
  ('Chef Anton''s Cajun Seasoning', 2, 2, 22.00, 53),
  ('Gumbo Mix', 2, 2, 21.35, 0);

INSERT INTO customers (customer_id, company_name, contact_name, city, country, phone) VALUES
  ('ALFKI', 'Alfreds Futterkiste', 'Maria Anders', 'Berlin', 'Germany', '030-0074321'),
  ('ANATR', 'Ana Trujillo Emparedados', 'Ana Trujillo', 'México D.F.', 'Mexico', '(5) 555-4729'),
  ('ANTON', 'Antonio Moreno Taquería', 'Antonio Moreno', 'México D.F.', 'Mexico', '(5) 555-3932');

INSERT INTO employees (last_name, first_name, title, city, country, hire_date) VALUES
  ('Davolio', 'Nancy', 'Sales Representative', 'Seattle', 'USA', '1992-05-01'),
  ('Fuller', 'Andrew', 'Vice President, Sales', 'Tacoma', 'USA', '1992-08-14'),
  ('Leverling', 'Janet', 'Sales Representative', 'Kirkland', 'USA', '1992-04-01');

INSERT INTO orders (customer_id, employee_id, order_date, ship_city, ship_country) VALUES
  ('ALFKI', 1, '1996-07-04', 'Berlin', 'Germany'),
  ('ANATR', 2, '1996-07-05', 'México D.F.', 'Mexico'),
  ('ANTON', 3, '1996-07-08', 'México D.F.', 'Mexico');

INSERT INTO order_details (order_id, product_id, unit_price, quantity, discount) VALUES
  (1, 1, 18.00, 10, 0.0),
  (1, 2, 19.00, 5, 0.0),
  (2, 3, 10.00, 20, 0.05),
  (3, 4, 22.00, 15, 0.0);

-- Create indexes for better query performance
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_employee ON orders(employee_id);
CREATE INDEX idx_order_details_order ON order_details(order_id);
CREATE INDEX idx_order_details_product ON order_details(product_id);
