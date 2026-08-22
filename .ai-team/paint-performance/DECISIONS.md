# Decisions

- Usar lote explícito por traço em vez de cache mutável no processo do Uvicorn.
- O canvas continua otimista e local durante o arraste.
- Carimbos comuns usam redraw parcial; redraw total continua reservado para operações
  como fill, undo e troca de frame.
- O backend valida o lote completo antes de aplicar qualquer região.
- Falha de rede recebe uma nova tentativa; falha definitiva fica visível na UI.
- O arquivo JSON interno passa a ser compacto; atomicidade por `os.replace` permanece.
