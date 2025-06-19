#!/usr/bin/env python3
"""
Script de diagnostic pour tester le chargement du modèle DeepSeek-R1.
Utile pour vérifier que l'environnement est correctement configuré.

Usage:
    python diagnose_model.py
"""

import transformers
from transformers import AutoConfig, AutoTokenizer, AutoModelForCausalLM
import torch
import os
import sys

MODEL_ID = "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B"

def main():
    print(f"🔍 Diagnostic du modèle DeepSeek-R1")
    print(f"📚 Transformers version: {transformers.__version__}")
    print(f"🔥 PyTorch version: {torch.__version__}")
    print(f"💻 CUDA disponible: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"🖥️ GPU: {torch.cuda.get_device_name(0)}")
    
    # 1. Tester la configuration
    print("\n1️⃣ Test de la configuration...")
    try:
        config = AutoConfig.from_pretrained(
            MODEL_ID,
            trust_remote_code=True
        )
        print(f"✅ Configuration chargée")
        print(f"   Architecture: {config.architectures if hasattr(config, 'architectures') else 'Non spécifiée'}")
        print(f"   Model type: {config.model_type}")
    except Exception as e:
        print(f"❌ Erreur config: {e}")
    
    # 2. Tester le tokenizer
    print("\n2️⃣ Test du tokenizer...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(
            MODEL_ID,
            trust_remote_code=True
        )
        print(f"✅ Tokenizer chargé")
        print(f"   Taille du vocabulaire: {tokenizer.vocab_size if hasattr(tokenizer, 'vocab_size') else 'Non disponible'}")
        
        # Test de tokenization
        test_text = "Bonjour, je suis un marchand vénitien."
        tokens = tokenizer(test_text)
        print(f"   Test de tokenization: '{test_text}' → {len(tokens['input_ids'])} tokens")
    except Exception as e:
        print(f"❌ Erreur tokenizer: {e}")
    
    # 3. Tester le modèle
    print("\n3️⃣ Test du modèle...")
    try:
        # Essayer d'abord sans quantification 8 bits
        print(f"Chargement du modèle DeepSeek-R1 sans quantification 8 bits...")
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            trust_remote_code=True,
            low_cpu_mem_usage=True,
            device_map="auto"
        )
        print(f"✅ Modèle chargé avec succès!")
        
        # Afficher des informations sur le modèle
        if hasattr(model, "config"):
            if hasattr(model.config, "hidden_size"):
                print(f"   Taille cachée: {model.config.hidden_size}")
            if hasattr(model.config, "num_hidden_layers"):
                print(f"   Nombre de couches: {model.config.num_hidden_layers}")
        
        # Test de génération
        try:
            print("\n4️⃣ Test de génération...")
            # Préparer les entrées avec attention_mask
            text = "Bonjour, je suis un marchand vénitien. Je vends"
            inputs = tokenizer(text, return_tensors="pt", padding=True)
            inputs = {k: v.to(model.device) for k, v in inputs.items()}
            
            # Définir explicitement pad_token_id et eos_token_id
            outputs = model.generate(
                inputs["input_ids"], 
                attention_mask=inputs["attention_mask"],
                max_new_tokens=20, 
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id
            )
            generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
            print(f"   Texte généré: {generated_text}")
        except Exception as e:
            print(f"❌ Erreur lors de la génération: {e}")
    except Exception as e:
        print(f"❌ Erreur lors du chargement du modèle: {e}")
        print("\n💡 Suggestions:")
        print("   1. Vérifiez que vous avez la dernière version de transformers:")
        print("      pip install --upgrade transformers")
        print("   2. Assurez-vous d'avoir suffisamment de mémoire GPU/RAM")
        print("   3. Vérifiez votre connexion internet pour télécharger le modèle")
        return
    
    print("\n✅ Diagnostic terminé avec succès!")
    print("Le modèle DeepSeek-R1 est prêt pour le fine-tuning.")

if __name__ == "__main__":
    main()
