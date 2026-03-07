# NAROK Web (GitHub Pages)

Tento priečinok je pripravený pre GitHub Pages deploy.

## Rýchly deploy

1. Vytvor GitHub repo (napr. `narok-mvp`).
2. V tomto priečinku/workspace nastav remote a pushni `main`.
3. V GitHub repozitári:
   - Settings → Pages
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/projects/narok/docs** *(ak to UI umožní)* alebo presuň obsah do `/docs` rootu repo.

## Odporúčaný jednoduchý variant

Ak GitHub Pages nedovolí hlbší podpriečinok, skopíruj obsah tohto priečinka do repo-root `/docs`:

```bash
mkdir -p docs
cp -R projects/narok/docs/* docs/
```

Potom v Pages nastav:
- Branch: `main`
- Folder: `/docs`

Po deploy bude URL v tvare:
`https://<tvoj-github-username>.github.io/<repo>/`
