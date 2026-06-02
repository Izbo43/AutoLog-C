# AutoLog

Sistema de cadastro e exibição de automóveis com perfis públicos por @handle.
Front em **HTML/CSS/JS puro**, backend em **PHP 7.4+ / MySQL 5.7+ (ou MariaDB 10.3+)**.

---

## Estrutura

```
Autolog/
├── application/
│   ├── index.html              ← landing
│   ├── perfil.html             ← perfil do usuário (?u=handle)
│   ├── cadastrocarro.html      ← formulário de novo carro (logado)
│   ├── registro.html           ← cadastro completo de usuário
│   ├── style.css
│   ├── script.js
│   ├── config.php
│   ├── README.md
│   └── api/
│       ├── _bootstrap.php
│       ├── db.php
│       ├── auth_register.php
│       ├── auth_login.php
│       ├── auth_logout.php
│       ├── auth_me.php
│       ├── users_search.php
│       ├── users_get.php
│       ├── cars_list.php
│       └── cars_create.php
└── database/
    └── schema.sql              ← DDL + dados demo
```

---

## Instalação rápida (XAMPP / Windows ou Linux)

### 1. Copie o projeto para o diretório do servidor

- **XAMPP:** `C:\xampp\htdocs\autolog\`
- **LAMP (Linux):** `/var/www/html/autolog/`
- **macOS (MAMP):** `/Applications/MAMP/htdocs/autolog/`

### 2. Importe o schema no MySQL

Abra o **phpMyAdmin** (http://localhost/phpmyadmin) → aba **SQL** → cole o conteúdo de `database/schema.sql` → executar.

Ou pelo terminal:
```bash
mysql -u root -p < database/schema.sql
```

### 3. Configure as credenciais

Edite `application/config.php` com seu usuário/senha do MySQL. No XAMPP padrão, o user é `root` e senha vazia.

### 4. Inicie o Apache + MySQL no XAMPP

Acesse: **http://localhost/autolog/application/**

---

## Como usar

1. Acesse `http://localhost/autolog/application/`
2. Clique em **"Ver lista de carros"** ou no botão **Login** no canto superior
3. Como você ainda não tem conta, clique em **"Registre-se"** no modal — você será levado para `registro.html`
4. Preencha o formulário completo (todos os campos do PDF) e clique em **Concluir Cadastro**
5. Após o cadastro você será redirecionado automaticamente para seu perfil (já logado)
6. Use o botão **"+ Adicionar Carro"** para cadastrar veículos
7. Use a barra de busca no topo para encontrar outros usuários por `@handle`

---

## Conta demo (opcional)

O `database/schema.sql` cria um usuário `MarioBros` com senha **`Mario@123`** (hash bcrypt incluso).
Se preferir, registre-se com seus próprios dados.

> ⚠ Se o login do `MarioBros` falhar, gere um novo hash. No PHP CLI:
> ```bash
> php -r "echo password_hash('Mario@123', PASSWORD_BCRYPT);"
> ```
> e atualize a coluna `senha_hash` da tabela `usuarios` com o resultado.

---

## API REST

Todos os endpoints respondem JSON `{ ok: true/false, data?, error?, code? }`.
A sessão é mantida via cookie httpOnly (`AUTOLOG_SESSION`).

| Endpoint                          | Método | Login | Descrição                           |
|-----------------------------------|--------|-------|-------------------------------------|
| `api/auth_register.php`           | POST   | —     | Cria usuário                        |
| `api/auth_login.php`              | POST   | —     | Email + senha                       |
| `api/auth_logout.php`             | POST   | ✓     | Encerra sessão                      |
| `api/auth_me.php`                 | GET    | —     | Retorna o usuário logado (ou null)  |
| `api/users_search.php?q=mario`    | GET    | ✓     | Sugestões de @username              |
| `api/users_get.php?handle=X`      | GET    | ✓     | Perfil público de um usuário        |
| `api/cars_list.php?handle=X`      | GET    | ✓     | Carros do usuário (dados privados só para o próprio dono) |
| `api/cars_create.php`             | POST   | ✓     | Novo carro do usuário logado        |

---

## Segurança

- Senhas armazenadas com **bcrypt** (`password_hash` + `password_verify`)
- **PDO com prepared statements** em todas as queries (anti-SQLi)
- Cookie de sessão `HttpOnly`, `SameSite=Lax`, regeneração de ID após login
- Dados privados (placa, RENAVAM, chassi, documentação) só retornam para o **dono** do carro
- Validação de **CPF e CNPJ** com cálculo de dígito verificador no backend
- Sanitização e limitação de tamanho em todos os inputs

---

## Troubleshooting

**"Arquivo config.php não encontrado"**
Crie/edite `application/config.php` com as credenciais do banco.

**"Falha de conexão com o banco de dados"**
Verifique se o MySQL está rodando e se as credenciais em `config.php` estão corretas. No XAMPP padrão: `host=127.0.0.1`, `user=root`, `pass=''`.

**A página de perfil mostra "Faça login para continuar" mesmo após logar**
Cookies de sessão precisam de um domínio consistente. Acesse sempre por `http://localhost/autolog/application/` (não pelo IP).

**As imagens (foto de perfil/banner) ficam grandes no banco**
Por simplicidade, fotos são armazenadas como `base64` no campo `MEDIUMTEXT`. Para produção, considere salvar em disco (`/uploads/`) e guardar apenas o caminho.
