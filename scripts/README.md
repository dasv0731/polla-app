# scripts/

Scripts utilitarios que viven fuera del bundle de la app. Se ejecutan
local con tu identidad de AWS.

## delete-test-users.mjs

Borra todos los usuarios de Cognito **excepto** los configurados en
`KEEP_EMAILS` (por defecto: `smoketest@polla.local`).

### Pre-requisitos

1. AWS credentials con permisos sobre el user pool
   `us-east-1_3oQzVntws`. La identidad asumida necesita:
   - `cognito-idp:ListUsers`
   - `cognito-idp:AdminDeleteUser`

   Configurá con `aws configure` o exportá:
   ```sh
   export AWS_ACCESS_KEY_ID=…
   export AWS_SECRET_ACCESS_KEY=…
   ```

2. Node 18+ (usa `fetch` y AWS SDK v3 nativos).

### Setup

```sh
cd scripts
npm install
```

### Uso

```sh
# 1) Dry-run · te muestra qué borraría sin tocar nada
node delete-test-users.mjs

# 2) Borrar de verdad
node delete-test-users.mjs --confirm
```

### Qué borra y qué NO borra

**Sí**:
- Cognito User Pool: `admin-delete-user` para cada usuario con
  `email` distinto a los preservados en `KEEP_EMAILS`.

**No** (queda data huérfana, no rompe la app):
- Modelo `User` en GraphQL — el schema solo permite `delete` al
  grupo `admins`, no via API key. Tendría que ser ejecutado con un
  id-token de Cognito (más complejo).
- `Pick`, `GroupStandingPick`, `BracketPick`, `SpecialPick`,
  `BestThirdsPick`
- `Membership`, `UserGroupTotal`, `UserTournamentTotal`
- `Comodin`, `SponsorRedemption`, `TriviaAnswer`, `Notification`
- `Group` cuyo `adminUserId` apunta a un user borrado

Para reset 100% limpio: ir a la **consola DynamoDB en `us-east-1`**
y truncar las tablas que necesites — los nombres tienen prefijo
del modelo (ej. `User-…`, `Pick-…`).

### Alternativa rápida: AWS CLI one-liner

Si ya tenés AWS CLI configurado y no querés instalar nada:

**PowerShell**:
```powershell
$POOL = "us-east-1_3oQzVntws"
$KEEP = "smoketest@polla.local"

aws cognito-idp list-users --user-pool-id $POOL --output json `
  | ConvertFrom-Json `
  | ForEach-Object {
    foreach ($u in $_.Users) {
      $email = ($u.Attributes | Where-Object { $_.Name -eq 'email' }).Value
      if ($email -and $email -ne $KEEP) {
        Write-Host "Borrando $($u.Username) ($email)"
        aws cognito-idp admin-delete-user --user-pool-id $POOL --username $u.Username
      }
    }
  }
```

**Bash / Git Bash**:
```sh
POOL="us-east-1_3oQzVntws"
KEEP="smoketest@polla.local"

aws cognito-idp list-users --user-pool-id "$POOL" \
  --query "Users[?Attributes[?Name=='email' && Value!='$KEEP']].Username" \
  --output text \
  | tr '\t' '\n' \
  | while read username; do
      [ -z "$username" ] && continue
      echo "Borrando $username..."
      aws cognito-idp admin-delete-user --user-pool-id "$POOL" --username "$username"
    done
```

**Ojo**: `list-users` devuelve hasta 60 por página por default — si
tenés más usuarios de prueba, repetí la ejecución hasta que no haya
nada que borrar.

### Cambiar qué admin se preserva

Editá el set en `delete-test-users.mjs`:

```js
const KEEP_EMAILS = new Set([
  'smoketest@polla.local',
  // 'otro-admin@polla.local',
]);
```
