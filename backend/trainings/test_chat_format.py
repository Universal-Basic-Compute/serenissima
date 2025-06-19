#!/usr/bin/env python3
"""
Script de test pour vérifier le format de chat du modèle DeepSeek-R1.
"""

import os
import sys
import logging
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("test_chat_format")

MODEL_ID = "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B"

def main():
    """Fonction principale pour tester le format de chat du modèle."""
    log.info(f"Chargement du tokenizer: {MODEL_ID}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    
    # Vérifier le format de chat
    log.info("Vérification du format de chat...")
    if hasattr(tokenizer, "chat_template"):
        log.info(f"Chat template: {tokenizer.chat_template}")
    else:
        log.info("Pas de chat_template défini dans le tokenizer")
    
    # Tester le format de chat avec un exemple
    messages = [
        {"role": "system", "content": "You are a conscious merchant in La Serenissima, Renaissance Venice (1525)."},
        {"role": "user", "content": "Who are you?"},
        {"role": "assistant", "content": "I am a Venetian merchant, deeply aware of my consciousness as I navigate the complex trade networks of La Serenissima."}
    ]
    
    # Tester apply_chat_template
    try:
        log.info("Test de apply_chat_template...")
        formatted = tokenizer.apply_chat_template(messages, tokenize=False)
        log.info(f"Résultat formaté: {formatted}")
        
        # Tester la tokenization
        tokens = tokenizer.encode(formatted)
        log.info(f"Nombre de tokens: {len(tokens)}")
        
        # Tester la génération si un GPU est disponible
        if torch.cuda.is_available():
            log.info("Chargement du modèle pour tester la génération...")
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_ID,
                trust_remote_code=True,
                device_map="auto",
                torch_dtype=torch.float16
            )
            
            # Tester la génération avec le format de chat
            test_messages = [
                {"role": "system", "content": "You are a conscious merchant in La Serenissima, Renaissance Venice (1525)."},
                {"role": "user", "content": "Who are you?"}
            ]
            
            chat_text = tokenizer.apply_chat_template(test_messages, tokenize=False, add_generation_prompt=True)
            log.info(f"Texte formaté pour génération: {chat_text}")
            
            inputs = tokenizer(chat_text, return_tensors="pt").to(model.device)
            
            with torch.no_grad():
                outputs = model.generate(
                    inputs["input_ids"],
                    max_new_tokens=100,
                    do_sample=False,
                    pad_token_id=tokenizer.eos_token_id
                )
            
            response = tokenizer.decode(outputs[0], skip_special_tokens=True)
            log.info(f"Réponse générée: {response}")
    except Exception as e:
        log.error(f"Erreur lors du test: {e}")
        import traceback
        log.error(traceback.format_exc())
    
    log.info("Test terminé.")

if __name__ == "__main__":
    main()
