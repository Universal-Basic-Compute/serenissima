#!/usr/bin/env python3
"""
Script d'installation des dépendances pour le fine-tuning DeepSeek-R1.

Ce script installe les packages nécessaires pour le fine-tuning.
"""

import sys
import subprocess
import logging

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("install_dependencies")

def install_dependencies():
    """Installe les dépendances nécessaires pour le fine-tuning."""
    log.info("Installation des dépendances pour le fine-tuning DeepSeek-R1...")
    
    # Liste des packages nécessaires
    packages = [
        "torch>=2.0.0",
        "transformers>=4.30.0",
        "datasets>=2.12.0",
        "accelerate>=0.20.0",
        "wandb",
        "psutil",
        "gputil"
    ]
    
    try:
        for package in packages:
            log.info(f"Installation de {package}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        
        log.info("Toutes les dépendances ont été installées avec succès!")
        return True
    except Exception as e:
        log.error(f"Erreur lors de l'installation des dépendances: {e}")
        return False

if __name__ == "__main__":
    log.info("Démarrage de l'installation des dépendances...")
    success = install_dependencies()
    
    if success:
        log.info("Installation réussie. Vous pouvez maintenant exécuter le script de fine-tuning.")
        sys.exit(0)
    else:
        log.error("L'installation a échoué. Veuillez consulter les logs pour plus de détails.")
        sys.exit(1)
