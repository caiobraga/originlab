# Como Reinstalar Dependências

O erro que você está vendo é porque o `node_modules` foi removido mas não foi reinstalado corretamente devido a problemas de rede.

## Solução

Execute os seguintes comandos quando tiver acesso à internet:

```bash
# Remover node_modules e lockfiles antigos (se existirem)
rm -rf node_modules
rm -f package-lock.json

# Instalar dependências com pnpm
pnpm install

# Ou se não tiver pnpm instalado:
npm install -g pnpm
pnpm install
```

## Alternativa com npm (se pnpm não funcionar)

```bash
rm -rf node_modules
rm -f pnpm-lock.yaml
npm install
```

Depois de reinstalar, o erro deve desaparecer.

