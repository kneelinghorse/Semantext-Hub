-- Sakila Database Schema and Sample Data
-- Simplified DVD rental store database

-- Create tables
CREATE TABLE IF NOT EXISTS actor (
  actor_id SERIAL PRIMARY KEY,
  first_name VARCHAR(45) NOT NULL,
  last_name VARCHAR(45) NOT NULL,
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS category (
  category_id SERIAL PRIMARY KEY,
  name VARCHAR(25) NOT NULL,
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS language (
  language_id SERIAL PRIMARY KEY,
  name CHAR(20) NOT NULL,
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS film (
  film_id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  release_year INTEGER,
  language_id INTEGER NOT NULL REFERENCES language(language_id),
  rental_duration SMALLINT NOT NULL DEFAULT 3,
  rental_rate DECIMAL(4,2) NOT NULL DEFAULT 4.99,
  length SMALLINT,
  replacement_cost DECIMAL(5,2) NOT NULL DEFAULT 19.99,
  rating VARCHAR(10) DEFAULT 'G',
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS film_actor (
  actor_id INTEGER NOT NULL REFERENCES actor(actor_id),
  film_id INTEGER NOT NULL REFERENCES film(film_id),
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (actor_id, film_id)
);

CREATE TABLE IF NOT EXISTS film_category (
  film_id INTEGER NOT NULL REFERENCES film(film_id),
  category_id INTEGER NOT NULL REFERENCES category(category_id),
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (film_id, category_id)
);

CREATE TABLE IF NOT EXISTS country (
  country_id SERIAL PRIMARY KEY,
  country VARCHAR(50) NOT NULL,
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS city (
  city_id SERIAL PRIMARY KEY,
  city VARCHAR(50) NOT NULL,
  country_id INTEGER NOT NULL REFERENCES country(country_id),
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS address (
  address_id SERIAL PRIMARY KEY,
  address VARCHAR(50) NOT NULL,
  address2 VARCHAR(50),
  district VARCHAR(20) NOT NULL,
  city_id INTEGER NOT NULL REFERENCES city(city_id),
  postal_code VARCHAR(10),
  phone VARCHAR(20) NOT NULL,
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer (
  customer_id SERIAL PRIMARY KEY,
  first_name VARCHAR(45) NOT NULL,
  last_name VARCHAR(45) NOT NULL,
  email VARCHAR(50),
  address_id INTEGER NOT NULL REFERENCES address(address_id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  create_date DATE NOT NULL,
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff (
  staff_id SERIAL PRIMARY KEY,
  first_name VARCHAR(45) NOT NULL,
  last_name VARCHAR(45) NOT NULL,
  email VARCHAR(50),
  address_id INTEGER NOT NULL REFERENCES address(address_id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  username VARCHAR(16) NOT NULL,
  password VARCHAR(40),
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store (
  store_id SERIAL PRIMARY KEY,
  manager_staff_id INTEGER NOT NULL REFERENCES staff(staff_id),
  address_id INTEGER NOT NULL REFERENCES address(address_id),
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
  inventory_id SERIAL PRIMARY KEY,
  film_id INTEGER NOT NULL REFERENCES film(film_id),
  store_id INTEGER NOT NULL REFERENCES store(store_id),
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rental (
  rental_id SERIAL PRIMARY KEY,
  rental_date TIMESTAMP NOT NULL,
  inventory_id INTEGER NOT NULL REFERENCES inventory(inventory_id),
  customer_id INTEGER NOT NULL REFERENCES customer(customer_id),
  return_date TIMESTAMP,
  staff_id INTEGER NOT NULL REFERENCES staff(staff_id),
  last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment (
  payment_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customer(customer_id),
  staff_id INTEGER NOT NULL REFERENCES staff(staff_id),
  rental_id INTEGER NOT NULL REFERENCES rental(rental_id),
  amount DECIMAL(5,2) NOT NULL,
  payment_date TIMESTAMP NOT NULL
);

-- Insert sample data
INSERT INTO language (name) VALUES ('English'), ('Spanish'), ('French'), ('German'), ('Japanese');

INSERT INTO category (name) VALUES
  ('Action'), ('Animation'), ('Comedy'), ('Drama'), ('Horror'), ('Sci-Fi');

INSERT INTO actor (first_name, last_name) VALUES
  ('PENELOPE', 'GUINESS'), ('NICK', 'WAHLBERG'), ('ED', 'CHASE'), ('JENNIFER', 'DAVIS');

INSERT INTO film (title, description, release_year, language_id, rental_rate, length, replacement_cost, rating) VALUES
  ('ACADEMY DINOSAUR', 'A Epic Drama of a Feminist And a Mad Scientist', 2006, 1, 0.99, 86, 20.99, 'PG'),
  ('ACE GOLDFINGER', 'A Astounding Epistle of a Database Administrator', 2006, 1, 4.99, 48, 12.99, 'G'),
  ('ADAPTATION HOLES', 'A Astounding Reflection of a Lumberjack', 2006, 1, 2.99, 50, 18.99, 'NC-17');

INSERT INTO film_actor (actor_id, film_id) VALUES (1, 1), (1, 2), (2, 1), (3, 3);

INSERT INTO film_category (film_id, category_id) VALUES (1, 1), (2, 1), (3, 6);

INSERT INTO country (country) VALUES ('United States'), ('Canada'), ('Mexico'), ('Japan');

INSERT INTO city (city, country_id) VALUES
  ('Los Angeles', 1), ('New York', 1), ('Toronto', 2), ('Vancouver', 2);

INSERT INTO address (address, district, city_id, postal_code, phone) VALUES
  ('1234 Main St', 'California', 1, '90001', '555-1234'),
  ('5678 Broadway', 'New York', 2, '10001', '555-5678');

INSERT INTO customer (first_name, last_name, email, address_id, create_date) VALUES
  ('MARY', 'SMITH', 'mary.smith@sakilacustomer.org', 1, '2006-02-14'),
  ('PATRICIA', 'JOHNSON', 'patricia.johnson@sakilacustomer.org', 2, '2006-02-14');

INSERT INTO staff (first_name, last_name, email, address_id, username, password) VALUES
  ('Mike', 'Hillyer', 'mike.hillyer@sakilastaff.com', 1, 'Mike', 'password123'),
  ('Jon', 'Stephens', 'jon.stephens@sakilastaff.com', 2, 'Jon', 'password456');

INSERT INTO store (manager_staff_id, address_id) VALUES (1, 1), (2, 2);

INSERT INTO inventory (film_id, store_id) VALUES (1, 1), (1, 2), (2, 1), (3, 2);

INSERT INTO rental (rental_date, inventory_id, customer_id, staff_id, return_date) VALUES
  ('2005-05-24 22:53:30', 1, 1, 1, '2005-05-26 22:04:30'),
  ('2005-05-24 22:54:33', 2, 2, 2, '2005-05-28 19:40:33');

INSERT INTO payment (customer_id, staff_id, rental_id, amount, payment_date) VALUES
  (1, 1, 1, 2.99, '2005-05-25 11:30:37'),
  (2, 2, 2, 4.99, '2005-05-25 12:18:42');

-- Create indexes
CREATE INDEX idx_actor_last_name ON actor(last_name);
CREATE INDEX idx_film_title ON film(title);
CREATE INDEX idx_customer_last_name ON customer(last_name);
CREATE INDEX idx_rental_date ON rental(rental_date);
CREATE INDEX idx_payment_date ON payment(payment_date);
