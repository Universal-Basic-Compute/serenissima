import os
import requests
import argparse
from dotenv import load_dotenv
import mimetypes # Pour déterminer le type MIME si nécessaire, bien que requests le fasse souvent.

# Default API URL, can be overridden by env var or arg
DEFAULT_FASTAPI_URL = "https://backend.serenissima.ai/"

def upload_file(api_url: str, api_key: str, file_path: str, destination_path: str) -> bool:
    """
    Téléverse un fichier unique vers l'endpoint /api/upload-asset.

    Args:
        api_url (str): L'URL de base de l'API (ex: http://localhost:8000).
        api_key (str): La clé API pour l'authentification.
        file_path (str): Le chemin complet vers le fichier local à téléverser.
        destination_path (str): Le chemin relatif de destination sur le serveur
                                (ex: images/avatars).

    Returns:
        bool: True si le téléversement a réussi, False sinon.
    """
    upload_endpoint = f"{api_url.rstrip('/')}/api/upload-asset"
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (os.path.basename(file_path), f)}
            data = {'destination_path': destination_path}
            headers = {'X-Upload-Api-Key': api_key}
            
            print(f"Téléversement de '{file_path}' vers '{destination_path}' sur {upload_endpoint}...")
            response = requests.post(upload_endpoint, files=files, data=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                print(f"Succès : {file_path} téléversé vers {response.json().get('saved_path')}")
                return True
            else:
                print(f"Échec du téléversement de {file_path}. Statut: {response.status_code}, Réponse: {response.text}")
                return False
    except requests.exceptions.RequestException as e:
        print(f"Erreur de requête lors du téléversement de {file_path}: {e}")
        return False
    except IOError as e:
        print(f"Erreur d'IO lors de la lecture de {file_path}: {e}")
        return False
    except Exception as e:
        print(f"Erreur inattendue lors du téléversement de {file_path}: {e}")
        return False

def main():
    # Charger les variables d'environnement depuis .env
    dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env') # Chemin vers .env à la racine
    load_dotenv(dotenv_path=dotenv_path)

    parser = argparse.ArgumentParser(description="Téléverser des assets publics vers le serveur.")
    parser.add_argument("source_directory", help="Le dossier local contenant les assets à téléverser.")
    parser.add_argument("--api_url", default=os.getenv("FASTAPI_BACKEND_URL", DEFAULT_FASTAPI_URL),
                        help="L'URL de base de l'API FastAPI (par défaut: https://backend.serenissima.ai/ ou FASTAPI_BACKEND_URL de .env).")
    parser.add_argument("--api_key", default=os.getenv("UPLOAD_API_KEY"),
                        help="La clé API pour l'endpoint de téléversement (par défaut: UPLOAD_API_KEY de .env).")
    
    args = parser.parse_args()

    if not args.api_key:
        print("Erreur: La clé API de téléversement est requise. Fournissez-la via --api_key ou la variable d'environnement UPLOAD_API_KEY.")
        return

    source_dir = os.path.abspath(args.source_directory)
    if not os.path.isdir(source_dir):
        print(f"Erreur: Le dossier source '{source_dir}' n'existe pas ou n'est pas un dossier.")
        return

    print(f"Dossier source : {source_dir}")
    print(f"URL de l'API   : {args.api_url}")
    print(f"Clé API        : {'*' * (len(args.api_key) - 3) + args.api_key[-3:] if len(args.api_key) > 3 else '***'}")

    successful_uploads = 0
    failed_uploads = 0

    for root, _, files in os.walk(source_dir):
        for filename in files:
            local_file_path = os.path.join(root, filename)
            
            # Calculer le chemin de destination relatif par rapport au dossier source
            relative_path_to_file = os.path.relpath(local_file_path, source_dir)
            # Le chemin de destination pour l'API est le dossier parent du fichier relatif
            destination_on_server = os.path.dirname(relative_path_to_file)
            # Remplacer les séparateurs de chemin Windows par des slashes pour l'URL/API
            destination_on_server = destination_on_server.replace(os.path.sep, '/')

            if upload_file(args.api_url, args.api_key, local_file_path, destination_on_server):
                successful_uploads += 1
            else:
                failed_uploads += 1
    
    print("\nRésumé du téléversement:")
    print(f"  Fichiers téléversés avec succès : {successful_uploads}")
    print(f"  Échecs de téléversement         : {failed_uploads}")

if __name__ == "__main__":
    main()
