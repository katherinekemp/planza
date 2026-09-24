resource "aws_db_subnet_group" "main" {
  name       = "planza"
  subnet_ids = aws_subnet.private[*].id
}

resource "random_password" "db" {
  length  = 32
  special = false # Avoids URL-escaping problems in DATABASE_URL.
}

resource "aws_db_instance" "main" {
  identifier     = "planza"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "planza"
  username = "planza"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false # A standby replica would double the cost; fine for an MVP.

  # Daily backups kept 7 days, allowing restore to any point in that window.
  # Windows are in UTC: ~3am Pacific.
  backup_retention_period    = 7
  backup_window              = "10:00-10:30"
  maintenance_window         = "sun:10:45-sun:11:15"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  # Guard rails against accidental data loss.
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "planza-final"
}
