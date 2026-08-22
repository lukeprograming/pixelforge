# Decisions

- O autosave incremental continua usando `/stroke`, preservando o ganho de desempenho.
- O botão Salvar usa uma sincronização integral do frame como mecanismo de recuperação.
- O autosave também dispara após 800 ms sem novas edições, além do mouse-up/blur.
- O backend valida toda a matriz antes de substituir o frame.
- O estado de persistência fica visível na barra inferior do editor.
