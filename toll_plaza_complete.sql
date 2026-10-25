-- =====================================================================
-- Automated Toll Plaza & RFID Vehicle Movement Ledger
-- Complete MySQL 8.0+ script
-- Sections:
--   1. DDL (CREATE, constraints, indexes)
--   2. ALTER / DROP demonstrations
--   3. Views
--   4. Function, Stored Procedure (with transaction), Triggers
--   5. Sample data (DML INSERT)
--   6. Queries (SELECT, JOIN, GROUP BY, HAVING, subquery, etc.)
--   7. UPDATE / DELETE demos
--   8. Constraint / integrity tests
-- WARNING: Section 1 drops and recreates the database.
-- =====================================================================

DROP DATABASE IF EXISTS toll_plaza_ledger;
CREATE DATABASE toll_plaza_ledger;
USE toll_plaza_ledger;

-- =====================================================================
-- 1. DDL
-- =====================================================================

CREATE TABLE Owner (
  Owner_ID INT AUTO_INCREMENT PRIMARY KEY,
  Name     VARCHAR(100) NOT NULL,
  Phone    VARCHAR(15)  NOT NULL,
  CONSTRAINT chk_owner_phone CHECK (Phone REGEXP '^[0-9]{10,15}$')
);

CREATE TABLE VehicleClass (
  Class_ID   INT AUTO_INCREMENT PRIMARY KEY,
  Class_Name VARCHAR(50)  NOT NULL UNIQUE,
  Toll_Rate  DECIMAL(8,2) NOT NULL,
  CONSTRAINT chk_rate CHECK (Toll_Rate > 0)
);

CREATE TABLE TollPlaza (
  Plaza_ID   INT AUTO_INCREMENT PRIMARY KEY,
  Plaza_Name VARCHAR(100) NOT NULL UNIQUE,
  Location   VARCHAR(150) NOT NULL
);

CREATE TABLE Employee (
  Emp_ID INT AUTO_INCREMENT PRIMARY KEY,
  Name   VARCHAR(100) NOT NULL,
  Shift  VARCHAR(20)  NOT NULL,
  CONSTRAINT chk_shift CHECK (Shift IN ('Morning','Evening','Night'))
);

CREATE TABLE Vehicle (
  Vehicle_ID   INT AUTO_INCREMENT PRIMARY KEY,
  Reg_Number   VARCHAR(20) NOT NULL UNIQUE,
  Vehicle_Type VARCHAR(30) NOT NULL,
  Owner_ID     INT NOT NULL,
  Class_ID     INT NOT NULL,
  FOREIGN KEY (Owner_ID) REFERENCES Owner(Owner_ID)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (Class_ID) REFERENCES VehicleClass(Class_ID)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE TollLane (
  Lane_ID   INT AUTO_INCREMENT PRIMARY KEY,
  Lane_No   INT NOT NULL,
  Lane_Type VARCHAR(30) NOT NULL,
  Plaza_ID  INT NOT NULL,
  Emp_ID    INT,
  FOREIGN KEY (Plaza_ID) REFERENCES TollPlaza(Plaza_ID)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (Emp_ID) REFERENCES Employee(Emp_ID)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT uq_plaza_lane UNIQUE (Plaza_ID, Lane_No),
  CONSTRAINT chk_lane_type CHECK (Lane_Type IN ('FASTag','Manual','Express')),
  CONSTRAINT chk_lane_no CHECK (Lane_No > 0)
);

CREATE TABLE RFID_Tag (
  Tag_ID     INT AUTO_INCREMENT PRIMARY KEY,
  Tag_Number VARCHAR(30) NOT NULL UNIQUE,
  Balance    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  Status     ENUM('Active','Blocked','Expired') NOT NULL DEFAULT 'Active',
  Vehicle_ID INT NOT NULL UNIQUE,            -- enforces 1:1 with Vehicle
  FOREIGN KEY (Vehicle_ID) REFERENCES Vehicle(Vehicle_ID)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_balance CHECK (Balance >= 0)
);

CREATE TABLE Transaction (
  Transaction_ID INT AUTO_INCREMENT PRIMARY KEY,
  Timestamp      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Amount         DECIMAL(8,2) NOT NULL,
  Status         ENUM('Success','Failed','Insufficient_Balance') NOT NULL,
  Tag_ID         INT NOT NULL,
  Lane_ID        INT NOT NULL,
  FOREIGN KEY (Tag_ID) REFERENCES RFID_Tag(Tag_ID)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (Lane_ID) REFERENCES TollLane(Lane_ID)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_amount CHECK (Amount >= 0)
);

-- Login table for authentication + role-based access (min. 2 roles)
CREATE TABLE AppUser (
  User_ID       INT AUTO_INCREMENT PRIMARY KEY,
  Username      VARCHAR(50)  NOT NULL UNIQUE,
  Password_Hash VARCHAR(255) NOT NULL,
  Role          ENUM('Admin','Staff') NOT NULL,
  Emp_ID        INT NULL,
  FOREIGN KEY (Emp_ID) REFERENCES Employee(Emp_ID)
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- Audit table (filled by trigger)
CREATE TABLE TagAudit (
  Audit_ID    INT AUTO_INCREMENT PRIMARY KEY,
  Tag_ID      INT NOT NULL,
  Old_Balance DECIMAL(10,2),
  New_Balance DECIMAL(10,2),
  Old_Status  VARCHAR(10),
  New_Status  VARCHAR(10),
  Changed_At  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_vehicle_owner       ON Vehicle(Owner_ID);
CREATE INDEX idx_transaction_tag     ON Transaction(Tag_ID);
CREATE INDEX idx_transaction_lane    ON Transaction(Lane_ID);
CREATE INDEX idx_transaction_time    ON Transaction(Timestamp);
CREATE FULLTEXT INDEX ft_plaza_search ON TollPlaza(Plaza_Name, Location);

-- =====================================================================
-- 2. ALTER / DROP demonstrations
-- =====================================================================

-- ALTER: add a column, modify a column, add a constraint
ALTER TABLE Owner ADD COLUMN Email VARCHAR(100) NULL;
ALTER TABLE Owner MODIFY COLUMN Name VARCHAR(120) NOT NULL;
ALTER TABLE Owner ADD CONSTRAINT uq_owner_email UNIQUE (Email);

-- DROP: drop a constraint, an index, a column, and a whole table
ALTER TABLE Owner DROP INDEX uq_owner_email;
ALTER TABLE Owner DROP COLUMN Email;

CREATE TABLE TempDemo (id INT PRIMARY KEY);
CREATE INDEX idx_temp ON TempDemo(id);
DROP INDEX idx_temp ON TempDemo;
DROP TABLE TempDemo;

-- =====================================================================
-- 3. VIEWS
-- =====================================================================

CREATE VIEW DailyRevenue AS
SELECT p.Plaza_Name,
       DATE(t.Timestamp) AS Day,
       COUNT(*)          AS Vehicles,
       SUM(t.Amount)     AS Revenue
FROM Transaction t
JOIN TollLane  l ON t.Lane_ID  = l.Lane_ID
JOIN TollPlaza p ON l.Plaza_ID = p.Plaza_ID
WHERE t.Status = 'Success'
GROUP BY p.Plaza_Name, DATE(t.Timestamp);

CREATE VIEW VehicleDetails AS
SELECT v.Vehicle_ID, v.Reg_Number, v.Vehicle_Type,
       o.Name AS Owner_Name, o.Phone,
       c.Class_Name, c.Toll_Rate,
       t.Tag_Number, t.Balance, t.Status AS Tag_Status
FROM Vehicle v
JOIN Owner o        ON v.Owner_ID = o.Owner_ID
JOIN VehicleClass c ON v.Class_ID = c.Class_ID
LEFT JOIN RFID_Tag t ON t.Vehicle_ID = v.Vehicle_ID;

CREATE VIEW LowBalanceTags AS
SELECT t.Tag_Number, v.Reg_Number, o.Name AS Owner_Name, t.Balance
FROM RFID_Tag t
JOIN Vehicle v ON t.Vehicle_ID = v.Vehicle_ID
JOIN Owner o   ON v.Owner_ID = o.Owner_ID
WHERE t.Balance < 200 AND t.Status = 'Active';

-- =====================================================================
-- 4. FUNCTION, STORED PROCEDURE (with TRANSACTION), TRIGGERS
-- =====================================================================

DELIMITER //

-- Function: toll rate for a vehicle
CREATE FUNCTION fn_vehicle_toll(p_vehicle_id INT)
RETURNS DECIMAL(8,2)
READS SQL DATA
BEGIN
  DECLARE v_rate DECIMAL(8,2);
  SELECT c.Toll_Rate INTO v_rate
  FROM Vehicle v JOIN VehicleClass c ON v.Class_ID = c.Class_ID
  WHERE v.Vehicle_ID = p_vehicle_id;
  RETURN v_rate;
END //

-- Procedure: process one toll event atomically
CREATE PROCEDURE process_toll(
  IN  p_tag    VARCHAR(30),
  IN  p_lane   INT,
  OUT p_result VARCHAR(30)
)
main_block: BEGIN
  DECLARE v_tag    INT DEFAULT NULL;
  DECLARE v_rate   DECIMAL(8,2);
  DECLARE v_bal    DECIMAL(10,2);
  DECLARE v_status VARCHAR(10);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SET p_result = 'Error';
  END;

  -- Find tag and the toll rate for its vehicle class
  SELECT t.Tag_ID, c.Toll_Rate INTO v_tag, v_rate
  FROM RFID_Tag t
  JOIN Vehicle v      ON t.Vehicle_ID = v.Vehicle_ID
  JOIN VehicleClass c ON v.Class_ID   = c.Class_ID
  WHERE t.Tag_Number = p_tag;

  IF v_tag IS NULL THEN
    SET p_result = 'Tag_Not_Found';
    LEAVE main_block;
  END IF;

  START TRANSACTION;

  -- Lock the tag row so two lanes cannot deduct at the same time
  SELECT Balance, Status INTO v_bal, v_status
  FROM RFID_Tag WHERE Tag_ID = v_tag FOR UPDATE;

  IF v_status <> 'Active' THEN
    INSERT INTO Transaction(Amount, Status, Tag_ID, Lane_ID)
    VALUES (0, 'Failed', v_tag, p_lane);
    SET p_result = 'Failed';
  ELSEIF v_bal < v_rate THEN
    INSERT INTO Transaction(Amount, Status, Tag_ID, Lane_ID)
    VALUES (0, 'Insufficient_Balance', v_tag, p_lane);
    SET p_result = 'Insufficient_Balance';
  ELSE
    UPDATE RFID_Tag SET Balance = Balance - v_rate WHERE Tag_ID = v_tag;
    INSERT INTO Transaction(Amount, Status, Tag_ID, Lane_ID)
    VALUES (v_rate, 'Success', v_tag, p_lane);
    SET p_result = 'Success';
  END IF;

  COMMIT;
END //

-- Procedure: recharge a tag (reactivates it if it was auto-blocked)
CREATE PROCEDURE recharge_tag(
  IN p_tag    VARCHAR(30),
  IN p_amount DECIMAL(10,2)
)
BEGIN
  DECLARE v_count INT DEFAULT 0;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Recharge amount must be positive';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM RFID_Tag
  WHERE Tag_Number = p_tag;

  IF v_count = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Tag not found';
  END IF;

  UPDATE RFID_Tag
  SET Balance = Balance + p_amount,
      Status  = IF(Status = 'Blocked', 'Active', Status)
  WHERE Tag_Number = p_tag;
END //

-- Trigger 1: auto-block a tag when its balance reaches zero
CREATE TRIGGER trg_block_zero_balance
BEFORE UPDATE ON RFID_Tag
FOR EACH ROW
BEGIN
  IF NEW.Balance = 0 AND NEW.Status = 'Active' THEN
    SET NEW.Status = 'Blocked';
  END IF;
END //

-- Trigger 2: audit every balance/status change
CREATE TRIGGER trg_tag_audit
AFTER UPDATE ON RFID_Tag
FOR EACH ROW
BEGIN
  IF NOT (OLD.Balance <=> NEW.Balance) OR NOT (OLD.Status <=> NEW.Status) THEN
    INSERT INTO TagAudit(Tag_ID, Old_Balance, New_Balance, Old_Status, New_Status)
    VALUES (OLD.Tag_ID, OLD.Balance, NEW.Balance, OLD.Status, NEW.Status);
  END IF;
END //

-- Trigger 3: a tag cannot be created with a negative opening balance
-- (extra safety on top of the CHECK constraint, with a clear message)
CREATE TRIGGER trg_tag_before_insert
BEFORE INSERT ON RFID_Tag
FOR EACH ROW
BEGIN
  IF NEW.Balance < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Opening balance cannot be negative';
  END IF;
END //

DELIMITER ;

-- =====================================================================
-- 5. SAMPLE DATA (INSERT)
-- =====================================================================

INSERT INTO Owner (Name, Phone) VALUES
('Rahul Sharma',  '9876543210'),
('Priya Nair',    '9123456780'),
('Arjun Reddy',   '9988776655'),
('Sneha Iyer',    '9090909090'),
('Kiran Kumar',   '9812345678'),
('Meera Das',     '9701234567');

INSERT INTO VehicleClass (Class_Name, Toll_Rate) VALUES
('Car/Jeep',        100.00),
('Light Commercial',160.00),
('Bus/Truck',       330.00),
('Multi-Axle',      520.00);

INSERT INTO TollPlaza (Plaza_Name, Location) VALUES
('Electronic City Plaza', 'NH44 Bengaluru South'),
('Hosur Road Plaza',      'NH48 Hosur Highway'),
('Tumkur Road Plaza',     'NH48 Bengaluru North');

INSERT INTO Employee (Name, Shift) VALUES
('Ramesh', 'Morning'),
('Suresh', 'Evening'),
('Lakshmi','Night'),
('Anita',  'Morning');

INSERT INTO Vehicle (Reg_Number, Vehicle_Type, Owner_ID, Class_ID) VALUES
('KA01AB1234', 'Car',   1, 1),
('KA02CD5678', 'SUV',   2, 1),
('KA03EF9012', 'Van',   3, 2),
('KA04GH3456', 'Truck', 4, 3),
('KA05IJ7890', 'Bus',   5, 3),
('KA06KL1122', 'Trailer',6, 4);

INSERT INTO TollLane (Lane_No, Lane_Type, Plaza_ID, Emp_ID) VALUES
(1, 'FASTag',  1, 1),
(2, 'FASTag',  1, 2),
(1, 'FASTag',  2, 3),
(2, 'Manual',  2, 4),
(1, 'Express', 3, 1),
(2, 'FASTag',  3, 2);

INSERT INTO RFID_Tag (Tag_Number, Balance, Status, Vehicle_ID) VALUES
('TAG1001', 1500.00, 'Active',  1),
('TAG1002',  150.00, 'Active',  2),   -- low balance
('TAG1003',  800.00, 'Active',  3),
('TAG1004',  330.00, 'Active',  4),   -- exactly one truck toll left
('TAG1005',  600.00, 'Blocked', 5),
('TAG1006', 2000.00, 'Expired', 6);

-- Login users (Password_Hash values are PLACEHOLDERS: generate real bcrypt
-- hashes from your Next.js backend and replace these)
INSERT INTO AppUser (Username, Password_Hash, Role, Emp_ID) VALUES
('admin',  '$2b$10$REPLACE_WITH_REAL_BCRYPT_HASH_ADMIN', 'Admin', NULL),
('ramesh', '$2b$10$REPLACE_WITH_REAL_BCRYPT_HASH_STAFF', 'Staff', 1),
('suresh', '$2b$10$REPLACE_WITH_REAL_BCRYPT_HASH_STAFF', 'Staff', 2);

-- Historical transactions (direct INSERT with past dates so reports have data)
INSERT INTO Transaction (Timestamp, Amount, Status, Tag_ID, Lane_ID) VALUES
(DATE_SUB(NOW(), INTERVAL 3 DAY), 100.00, 'Success', 1, 1),
(DATE_SUB(NOW(), INTERVAL 3 DAY), 100.00, 'Success', 2, 2),
(DATE_SUB(NOW(), INTERVAL 3 DAY), 160.00, 'Success', 3, 3),
(DATE_SUB(NOW(), INTERVAL 2 DAY), 330.00, 'Success', 4, 4),
(DATE_SUB(NOW(), INTERVAL 2 DAY), 100.00, 'Success', 1, 5),
(DATE_SUB(NOW(), INTERVAL 2 DAY),   0.00, 'Failed',  5, 6),
(DATE_SUB(NOW(), INTERVAL 1 DAY), 100.00, 'Success', 1, 1),
(DATE_SUB(NOW(), INTERVAL 1 DAY), 160.00, 'Success', 3, 5),
(DATE_SUB(NOW(), INTERVAL 1 DAY),   0.00, 'Insufficient_Balance', 2, 3),
(DATE_SUB(NOW(), INTERVAL 1 DAY), 100.00, 'Success', 2, 1);

-- Live transactions through the stored procedure
CALL process_toll('TAG1001', 1, @r1); SELECT @r1 AS Result_TAG1001;   -- Success
CALL process_toll('TAG1004', 3, @r2); SELECT @r2 AS Result_TAG1004;   -- Success, balance -> 0, trigger blocks tag
CALL process_toll('TAG1004', 3, @r3); SELECT @r3 AS Result_TAG1004_again; -- Failed (blocked)
CALL process_toll('TAG1005', 2, @r4); SELECT @r4 AS Result_TAG1005;   -- Failed (blocked)
CALL process_toll('TAG9999', 2, @r5); SELECT @r5 AS Result_Unknown;   -- Tag_Not_Found

-- =====================================================================
-- 6. QUERIES (SELECT)
-- =====================================================================

-- Q1: Basic SELECT with ORDER BY
SELECT * FROM Transaction ORDER BY Timestamp DESC;

-- Q2: JOIN (vehicle + owner + class + tag) via view
SELECT * FROM VehicleDetails;

-- Q3: Multi-table JOIN: full transaction ledger
SELECT t.Transaction_ID, t.Timestamp, v.Reg_Number, o.Name AS Owner,
       p.Plaza_Name, l.Lane_No, t.Amount, t.Status
FROM Transaction t
JOIN RFID_Tag  g ON t.Tag_ID   = g.Tag_ID
JOIN Vehicle   v ON g.Vehicle_ID = v.Vehicle_ID
JOIN Owner     o ON v.Owner_ID = o.Owner_ID
JOIN TollLane  l ON t.Lane_ID  = l.Lane_ID
JOIN TollPlaza p ON l.Plaza_ID = p.Plaza_ID
ORDER BY t.Timestamp DESC;

-- Q4: GROUP BY + aggregate: revenue per plaza
SELECT p.Plaza_Name, COUNT(*) AS Successful_Tolls, SUM(t.Amount) AS Total_Revenue
FROM Transaction t
JOIN TollLane l  ON t.Lane_ID = l.Lane_ID
JOIN TollPlaza p ON l.Plaza_ID = p.Plaza_ID
WHERE t.Status = 'Success'
GROUP BY p.Plaza_Name
ORDER BY Total_Revenue DESC;

-- Q5: GROUP BY + HAVING: plazas earning more than 300
SELECT p.Plaza_Name, SUM(t.Amount) AS Revenue
FROM Transaction t
JOIN TollLane l  ON t.Lane_ID = l.Lane_ID
JOIN TollPlaza p ON l.Plaza_ID = p.Plaza_ID
WHERE t.Status = 'Success'
GROUP BY p.Plaza_Name
HAVING SUM(t.Amount) > 300;

-- Q6: Subquery: tags with balance below the average
SELECT Tag_Number, Balance
FROM RFID_Tag
WHERE Balance < (SELECT AVG(Balance) FROM RFID_Tag);

-- Q7: Subquery: vehicles that have never had a successful toll
SELECT Reg_Number
FROM Vehicle
WHERE Vehicle_ID NOT IN (
  SELECT g.Vehicle_ID FROM RFID_Tag g
  JOIN Transaction t ON t.Tag_ID = g.Tag_ID
  WHERE t.Status = 'Success'
);

-- Q8: Busiest lanes (aggregate + ORDER BY + LIMIT)
SELECT p.Plaza_Name, l.Lane_No, COUNT(*) AS Total_Transactions
FROM Transaction t
JOIN TollLane l  ON t.Lane_ID = l.Lane_ID
JOIN TollPlaza p ON l.Plaza_ID = p.Plaza_ID
GROUP BY p.Plaza_Name, l.Lane_No
ORDER BY Total_Transactions DESC
LIMIT 5;

-- Q9: Employee performance (LEFT JOIN so idle employees show too)
SELECT e.Name, e.Shift, COUNT(t.Transaction_ID) AS Transactions_Handled
FROM Employee e
LEFT JOIN TollLane l    ON l.Emp_ID = e.Emp_ID
LEFT JOIN Transaction t ON t.Lane_ID = l.Lane_ID
GROUP BY e.Emp_ID, e.Name, e.Shift;

-- Q10: Views
SELECT * FROM DailyRevenue ORDER BY Day;
SELECT * FROM LowBalanceTags;

-- Q11: Full-text search on plazas
SELECT * FROM TollPlaza
WHERE MATCH(Plaza_Name, Location) AGAINST('Bengaluru' IN NATURAL LANGUAGE MODE);

-- Q12: Function usage
SELECT Reg_Number, fn_vehicle_toll(Vehicle_ID) AS Toll FROM Vehicle;

-- Q13: Audit trail created by the trigger
SELECT * FROM TagAudit ORDER BY Audit_ID;

-- Q14: Index usage (show in demo; look at the "key" column)
EXPLAIN SELECT * FROM Transaction WHERE Tag_ID = 1;
EXPLAIN SELECT * FROM Transaction WHERE Timestamp >= DATE_SUB(NOW(), INTERVAL 2 DAY);

-- =====================================================================
-- 7. UPDATE / DELETE demos
-- =====================================================================

-- UPDATE: change an employee shift
UPDATE Employee SET Shift = 'Evening' WHERE Emp_ID = 4;

-- UPDATE: recharge a tag via procedure (also unblocks it)
CALL recharge_tag('TAG1004', 500.00);
SELECT Tag_Number, Balance, Status FROM RFID_Tag WHERE Tag_Number = 'TAG1004';

-- UPDATE: increase toll rate for Bus/Truck
UPDATE VehicleClass SET Toll_Rate = 350.00 WHERE Class_Name = 'Bus/Truck';

-- DELETE: remove a lane (its transactions cascade; employee untouched)
DELETE FROM TollLane WHERE Lane_ID = 6;

-- Manual transaction demo: ROLLBACK undoes changes
START TRANSACTION;
UPDATE RFID_Tag SET Balance = Balance + 1000 WHERE Tag_Number = 'TAG1002';
SELECT Tag_Number, Balance FROM RFID_Tag WHERE Tag_Number = 'TAG1002';  -- shows +1000
ROLLBACK;
SELECT Tag_Number, Balance FROM RFID_Tag WHERE Tag_Number = 'TAG1002';  -- back to original

-- =====================================================================
-- 8. CONSTRAINT / INTEGRITY TESTS
-- Each statement below is EXPECTED TO FAIL. Run them one by one and
-- screenshot the error messages for your test-case documentation.
-- =====================================================================

-- T1: negative balance -> CHECK violation
-- UPDATE RFID_Tag SET Balance = -50 WHERE Tag_Number = 'TAG1001';

-- T2: duplicate registration number -> UNIQUE violation
-- INSERT INTO Vehicle (Reg_Number, Vehicle_Type, Owner_ID, Class_ID) VALUES ('KA01AB1234','Car',1,1);

-- T3: second tag for the same vehicle -> UNIQUE (1:1 relationship)
-- INSERT INTO RFID_Tag (Tag_Number, Balance, Vehicle_ID) VALUES ('TAG2000', 100, 1);

-- T4: invalid phone number -> CHECK violation
-- INSERT INTO Owner (Name, Phone) VALUES ('Test User', 'abc123');

-- T5: vehicle with non-existent owner -> FOREIGN KEY violation
-- INSERT INTO Vehicle (Reg_Number, Vehicle_Type, Owner_ID, Class_ID) VALUES ('KA99ZZ0000','Car',999,1);

-- T6: delete a class that vehicles still use -> ON DELETE RESTRICT
-- DELETE FROM VehicleClass WHERE Class_ID = 1;

-- T7: invalid shift value -> CHECK violation
-- INSERT INTO Employee (Name, Shift) VALUES ('Test', 'Afternoon');

-- T8: invalid status -> ENUM violation
-- UPDATE RFID_Tag SET Status = 'Lost' WHERE Tag_ID = 1;

-- T9: negative recharge -> custom error from procedure
-- CALL recharge_tag('TAG1001', -100);

-- T10: duplicate lane number in the same plaza -> UNIQUE violation
-- INSERT INTO TollLane (Lane_No, Lane_Type, Plaza_ID) VALUES (1,'FASTag',1);

-- =====================================================================
-- END OF SCRIPT
-- =====================================================================
