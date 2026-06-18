# Amostras de fatura PDF — Santander

Solte aqui os PDFs **reais** de fatura do Santander para o spike de extração PDF do milestone v1.3 (PDF-02/03/04).

## ⚠️ Dado financeiro pessoal

- Os `*.pdf` desta árvore são **gitignored** (`/fixtures/faturas-pdf/**/*.pdf` no `.gitignore`).
- **Nunca** comitar nem pushar essas faturas — o repositório vai para o GitHub público/privado da conta `DamascenoDev`.
- Este `README.md` é a única coisa rastreada nesta pasta.

## Uso

- Banco-alvo primário do spike: **Santander** (banco mais usado).
- O spike valida `pdf-parse` v2 `getTable()` contra estes layouts reais; `unpdf` como fallback de texto.
- Extração é **best-effort + review humano obrigatório** — nenhuma linha de PDF é auto-commitada (PDF-03).
