-- ============================================================
--  AutoLog — Schema MySQL
--  Execute via: mysql -u root -p < schema.sql
--  ou cole no phpMyAdmin > SQL.
-- ============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE DATABASE IF NOT EXISTS autolog
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE autolog;

-- (descomente as 3 linhas abaixo para resetar o schema)
-- DROP TABLE IF EXISTS posts;
-- DROP TABLE IF EXISTS carros;
-- DROP TABLE IF EXISTS usuarios;


-- ── USUÁRIOS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL,
  nome_display  VARCHAR(100) NOT NULL,
  nome_completo VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  senha_hash    VARCHAR(255) NOT NULL,
  cpf_cnpj      VARCHAR(20),
  telefone      VARCHAR(20),
  telefone2     VARCHAR(20),
  data_nasc     DATE,
  sobre         TEXT,
  foto_perfil   MEDIUMTEXT,
  foto_banner   MEDIUMTEXT,
  cep           VARCHAR(10),
  rua           VARCHAR(200),
  numero        VARCHAR(20),
  bairro        VARCHAR(100),
  cidade        VARCHAR(100),
  estado        CHAR(2),
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL DEFAULT NULL,

  INDEX idx_username     (username),
  INDEX idx_email        (email),
  INDEX idx_cpf_cnpj     (cpf_cnpj),
  INDEX idx_nome_display (nome_display),
  INDEX idx_usuarios_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── CARROS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carros (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NOT NULL,
  modelo        VARCHAR(150) NOT NULL,
  descricao     TEXT,
  fabricante    VARCHAR(100),
  ano           SMALLINT UNSIGNED,
  placa         VARCHAR(10),
  renavam       VARCHAR(11),
  chassi        VARCHAR(17),
  cidade        VARCHAR(100),
  estado        CHAR(2),
  combustivel   ENUM('Gasolina','Etanol','Flex','Diesel','Elétrico','Híbrido','GNV') DEFAULT 'Gasolina',
  quilometragem INT UNSIGNED,
  cambio        ENUM('Manual','Automático','CVT','Automatizado','Dupla embreagem'),
  cor           VARCHAR(50),
  motor         VARCHAR(80),
  documentacao  TEXT,
  foto_capa     MEDIUMTEXT,
  fotos_extra   JSON,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL DEFAULT NULL,

  CONSTRAINT fk_carros_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,

  INDEX idx_carros_placa    (placa),
  INDEX idx_carros_usuario  (usuario_id),
  INDEX idx_carros_modelo   (modelo),
  INDEX idx_carros_cidade   (cidade, estado),
  INDEX idx_carros_deleted  (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── POSTS / HISTÓRICO ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  carro_id     INT UNSIGNED NOT NULL,
  usuario_id   INT UNSIGNED NOT NULL,
  tipo         ENUM('preventiva','corretiva','estetica','upgrade','documentacao') NOT NULL,
  item         VARCHAR(200) NOT NULL,
  modificacao  TEXT NOT NULL,
  responsavel  VARCHAR(150) NOT NULL,
  imagens      JSON,
  criado_em    DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_posts_carro   FOREIGN KEY (carro_id)   REFERENCES carros(id)   ON DELETE CASCADE,
  CONSTRAINT fk_posts_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,

  INDEX idx_posts_carro (carro_id, criado_em DESC),
  INDEX idx_posts_tipo  (carro_id, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── VIEW PÚBLICA ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_carros_publicos AS
SELECT
  c.id, c.usuario_id,
  u.username, u.nome_display, u.foto_perfil,
  c.modelo, c.descricao, c.fabricante, c.ano,
  c.cidade, c.estado, c.combustivel, c.quilometragem,
  c.cambio, c.cor, c.motor,
  c.foto_capa, c.fotos_extra,
  c.criado_em
FROM carros c
JOIN usuarios u ON u.id = c.usuario_id;


-- ── DADOS DEMO ────────────────────────────────────────────────
INSERT IGNORE INTO usuarios
  (username, nome_display, nome_completo, email, senha_hash, cpf_cnpj, telefone,
   data_nasc, sobre, foto_perfil, foto_banner,
   cep, rua, numero, bairro, cidade, estado)
VALUES
  ('MarioBros', 'Dr. Mario', 'Mario Bros', 'mario@autolog.com',
   '$2y$12$8VR6c5ZF0d3GgC6vHkA1lOu0H4o5sQwq7XmK1J4kQpZ5Cn3kE8sIa',
   '12345678909', '11987654321',
   '1985-06-15',
   'Atualmente focado na otimização da relação peso-potência e no gerenciamento de projetos que minha esposa ainda não sabe o preço real.',
   'https://api.dicebear.com/7.x/bottts/svg?seed=MarioBros&backgroundColor=1a1a1f',
   'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1400&q=80',
   '13083970', 'Rua das Palmeiras', '100', 'Centro', 'Campinas', 'SP');
