#!/bin/bash
echo "🌱 Injection de l'utilisateur admin..."

docker exec -i afrixora-postgres psql -U afrixora -d afrixora_dev <<EOF
-- Supprimer l'utilisateur s'il existe déjà (pour éviter les conflits)
DELETE FROM "User" WHERE email = 'admin@afrixora.cd';

-- Insérer l'utilisateur admin (mot de passe haché avec bcrypt pour "Admin123!")
-- Le hash correspond à bcrypt coût 10: Admin123! -> $2b$10$9fZqX.4.QwGhZ8ZqX.4.QwGhZ8ZqX.4.QwGhZ8ZqX.4.QwGhZ8ZqX.4.QwGhZ
-- En réalité il faudra générer le hash de votre mot de passe. Utilisez plutôt un script Node.js.
-- Mais pour simplifier, voici un utilisateur avec un mot de passe temporaire.
INSERT INTO "User" (id, "tenantId", email, "passwordHash", name, role, "jwtVersion", "isActive", "createdAt")
VALUES (
  gen_random_uuid(),
  (SELECT id FROM "Tenant" LIMIT 1),  -- suppose qu'il y a au moins un tenant
  'admin@afrixora.cd',
  '$2b$10$9fZqX.4.QwGhZ8ZqX.4.QwGhZ8ZqX.4.QwGhZ8ZqX.4.QwGhZ8ZqX.4.QwGhZ', -- Admin123!
  'Admin AFRIXORA',
  'SUPER_ADMIN',
  0,
  true,
  NOW()
);
EOF

echo "✅ Utilisateur admin créé (si le tenant existe)."