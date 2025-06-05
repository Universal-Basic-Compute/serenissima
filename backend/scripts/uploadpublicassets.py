import os
import requests
import argparse
import pathlib
import sys # Added for sys.path modification
from dotenv import load_dotenv
import mimetypes # Pour déterminer le type MIME si nécessaire, bien que requests le fasse souvent.
import posixpath # Pour la jonction correcte des segments de chemin d'URL

# Default API URL, can be overridden by env var or arg
DEFAULT_FASTAPI_URL = "https://backend.serenissima.ai/"

# Add project root to sys.path for backend imports
backend_scripts_dir = os.path.dirname(__file__)
project_root_dir = os.path.abspath(os.path.join(backend_scripts_dir, '..', '..'))
if project_root_dir not in sys.path:
    sys.path.insert(0, project_root_dir)

try:
    from backend.engine.utils.activity_helpers import log_header, LogColors
    # Assuming colorama is already handled by activity_helpers or this script's direct imports
except ImportError:
    print("Failed to import log_header from backend.engine.utils.activity_helpers. Ensure PYTHONPATH is set or script is run from project root.")
    # Define a fallback simple log_header if import fails, so the script can still run
    def log_header(message, color_code=None): # color_code is unused in this fallback
        print(f"\n{'=' * 80}\n{message.center(80)}\n{'=' * 80}\n")
    class LogColors: # Dummy class
        HEADER = None # Unused in fallback

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
    filename = os.path.basename(file_path)

    # Construire le chemin relatif de l'asset sur le serveur
    # destination_path utilise déjà '/' comme séparateur grâce au traitement dans main()
    if destination_path:
        asset_server_path = posixpath.join(destination_path, filename)
    else:
        asset_server_path = filename

    # Construire l'URL publique pour la vérification
    # Supposant que les assets publics sont servis depuis /public_assets/ par rapport à api_url
    public_asset_base_url = f"{api_url.rstrip('/')}/public_assets"
    check_url = f"{public_asset_base_url}/{asset_server_path.lstrip('/')}"

    try:
        print(f"Vérification de l'existence de '{check_url}'...")
        # Attempt HEAD request
        try:
            head_response = requests.head(check_url, timeout=5, allow_redirects=True)
            if head_response.status_code == 200:
                content_type = head_response.headers.get('Content-Type', '').lower()
                if not content_type.startswith('image/'): # Vérifier si c'est une image
                    print(f"URL '{check_url}' (HEAD) a retourné Content-Type '{content_type}', pas le type attendu. Remplacement.")
                else:
                    remote_size_str = head_response.headers.get('Content-Length')
                    if remote_size_str:
                        try:
                            remote_size = int(remote_size_str)
                            local_size = os.path.getsize(file_path)
                            if remote_size == local_size:
                                print(f"Fichier '{file_path}' (type: {content_type}) existe déjà sur le serveur avec la même taille ({local_size} octets). Saut.")
                                return True
                            else:
                                print(f"Fichier '{file_path}' (type: {content_type}) existe sur le serveur mais la taille diffère (local: {local_size}, distant: {remote_size}). Remplacement.")
                        except ValueError:
                            print(f"Taille distante invalide ('{remote_size_str}') pour '{check_url}' (type: {content_type}). Remplacement par précaution.")
                    else:
                        print(f"Fichier '{file_path}' (type: {content_type}) existe sur le serveur mais la taille distante est inconnue (HEAD). Remplacement par précaution.")
            elif head_response.status_code == 404:
                print(f"Fichier '{check_url}' non trouvé (HEAD 404). Téléversement.")
            else:
                # HEAD a échoué avec un statut non-404 (ex: 405, 403). Essayer GET.
                print(f"HEAD request pour '{check_url}' a retourné {head_response.status_code}. Essai avec GET stream.")
                raise requests.exceptions.RequestException("FallbackToGET") # Déclencher le bloc except pour essayer GET

        except (requests.exceptions.Timeout, requests.exceptions.RequestException):
            # Ce bloc attrape les timeouts de HEAD, les erreurs de connexion, ou le "FallbackToGET"
            print(f"HEAD request pour '{check_url}' a échoué ou nécessite un fallback. Essai avec GET stream.")
            try:
                with requests.get(check_url, stream=True, timeout=10, allow_redirects=True) as get_response:
                    get_response.raise_for_status() # Lève HTTPError pour les mauvaises réponses (4xx ou 5xx)
                    
                    content_type = get_response.headers.get('Content-Type', '').lower()
                    if not content_type.startswith('image/'): # Vérifier si c'est une image
                        print(f"URL '{check_url}' (GET) a retourné Content-Type '{content_type}', pas le type attendu. Remplacement.")
                    else:
                        remote_size_str = get_response.headers.get('Content-Length')
                        if remote_size_str:
                            try:
                                remote_size = int(remote_size_str)
                                local_size = os.path.getsize(file_path)
                                if remote_size == local_size:
                                    print(f"Fichier '{file_path}' (type: {content_type}) existe déjà sur le serveur avec la même taille ({local_size} octets) (vérifié via GET). Saut.")
                                    return True
                                else:
                                    print(f"Fichier '{file_path}' (type: {content_type}) existe sur le serveur (vérifié via GET) mais la taille diffère (local: {local_size}, distant: {remote_size}). Remplacement.")
                            except ValueError:
                                print(f"Taille distante invalide ('{remote_size_str}') pour '{check_url}' (type: {content_type}, via GET). Remplacement par précaution.")
                        else:
                            print(f"Fichier '{file_path}' (type: {content_type}) existe sur le serveur (vérifié via GET) mais la taille distante est inconnue. Remplacement par précaution.")
            
            except requests.exceptions.HTTPError as e_http:
                if e_http.response.status_code == 404:
                    print(f"Fichier '{check_url}' non trouvé (GET stream 404). Téléversement.")
                else:
                    print(f"GET stream pour '{check_url}' a retourné une erreur HTTP {e_http.response.status_code}. Tentative de téléversement.")
            except (requests.exceptions.Timeout, requests.exceptions.RequestException) as e_get:
                print(f"GET stream pour '{check_url}' a aussi échoué ({e_get}). Tentative de téléversement.")
    
    except Exception as e: # Attraper d'autres erreurs potentielles comme os.path.getsize
        print(f"Erreur inattendue lors de la pré-vérification de {file_path}: {e}. Tentative de téléversement.")

    # Logique de téléversement originale
    except Exception as e: # Attraper d'autres erreurs potentielles comme os.path.getsize
        print(f"Erreur inattendue lors de la pré-vérification de {file_path}: {e}. Tentative de téléversement.")

    # Logique de téléversement originale
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (filename, f)} # Utiliser filename déjà défini
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
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--source_directory", help="Le dossier local contenant les assets à téléverser.")
    group.add_argument("--image", help="Le chemin complet vers un fichier image unique à téléverser.")
    
    parser.add_argument("--destination_path_on_server", default="",
                        help="Le chemin de destination relatif sur le serveur pour un fichier unique (ex: images/avatars). Si non fourni pour une image unique, elle sera placée à la racine des assets publics du type d'image (ex: images/nom_fichier.png).")
    parser.add_argument("--api_url", default=os.getenv("FASTAPI_BACKEND_URL", DEFAULT_FASTAPI_URL),
                        help="L'URL de base de l'API FastAPI (par défaut: https://backend.serenissima.ai/ ou FASTAPI_BACKEND_URL de .env).")
    parser.add_argument("--api_key", default=os.getenv("UPLOAD_API_KEY"),
                        help="La clé API pour l'endpoint de téléversement (par défaut: UPLOAD_API_KEY de .env).")
    
    args = parser.parse_args()

    log_header("Public Asset Upload Script") # Uses default Fore.CYAN

    if not args.api_key:
        print("Erreur: La clé API de téléversement est requise. Fournissez-la via --api_key ou la variable d'environnement UPLOAD_API_KEY.")
        return

    print(f"URL de l'API   : {args.api_url}")
    print(f"Clé API        : {'*' * (len(args.api_key) - 3) + args.api_key[-3:] if len(args.api_key) > 3 else '***'}")

    successful_uploads = 0
    failed_uploads = 0

    if args.image:
        image_path = os.path.abspath(args.image)
        if not os.path.isfile(image_path):
            print(f"Erreur: Le fichier image '{image_path}' n'existe pas ou n'est pas un fichier.")
            return
        
        print(f"Fichier image source : {image_path}")
        
        destination_on_server = args.destination_path_on_server.replace(os.path.sep, '/')
        if not destination_on_server:
            # Essayer de déduire le chemin de destination à partir du chemin de l'image source
            # en cherchant le dossier "public"
            try:
                path_parts = pathlib.Path(image_path).parts
                # Trouver l'index de "public" (insensible à la casse)
                public_index = -1
                for i, part in enumerate(path_parts):
                    if part.lower() == "public":
                        public_index = i
                        break
                
                if public_index != -1 and public_index < len(path_parts) - 2: # -2 car on veut le dossier parent du fichier
                    # Reconstruire le chemin relatif à partir de "public"
                    # On veut le dossier parent du fichier, donc jusqu'à l'avant-dernier élément après "public"
                    relative_parts = path_parts[public_index + 1 : -1] # Exclut "public" et le nom du fichier
                    destination_on_server = posixpath.join(*relative_parts)
                    print(f"Chemin de destination déduit à partir de '{image_path}' : '{destination_on_server}'")
                else:
                    # Si "public" n'est pas trouvé ou si le fichier est directement dans "public"
                    # (pas de sous-dossiers pour la destination), on met à la racine.
                    destination_on_server = "" # Signifie la racine du bucket d'upload
                    print(f"Impossible de déduire un chemin de destination significatif à partir de '{image_path}'. Utilisation de la racine du bucket d'upload.")
            except Exception as e:
                print(f"Erreur lors de la déduction du chemin de destination : {e}. Utilisation de la racine du bucket d'upload.")
                destination_on_server = ""

            if not destination_on_server: # Double vérification si la déduction a échoué
                 print(f"Chemin de destination sur le serveur : '{destination_on_server}' (racine du bucket d'upload ou chemin spécifié par l'API si vide ici)")
        else:
            print(f"Chemin de destination sur le serveur (fourni) : '{destination_on_server}'")

        if upload_file(args.api_url, args.api_key, image_path, destination_on_server):
            successful_uploads += 1
        else:
            failed_uploads += 1

    elif args.source_directory:
        source_dir = os.path.abspath(args.source_directory)
        if not os.path.isdir(source_dir):
            print(f"Erreur: Le dossier source '{source_dir}' n'existe pas ou n'est pas un dossier.")
            return

        print(f"Dossier source : {source_dir}")

        for root, _, files in os.walk(source_dir):
            for filename in files:
                local_file_path = os.path.join(root, filename)
                
                # Convertir source_dir et local_file_path en objets Path pour une manipulation plus aisée
                source_dir_path_obj = pathlib.Path(source_dir)
                local_file_path_obj = pathlib.Path(local_file_path)

                # Déterminer le chemin du fichier relatif au source_dir
                # Cela nous donne la structure des sous-dossiers à l'intérieur de source_dir
                path_of_file_within_source_dir = local_file_path_obj.relative_to(source_dir_path_obj)
                # Le répertoire de destination sur le serveur sera le parent de ce chemin relatif
                # ex: si le fichier est 'sounds/water/file.mp3' par rapport à source_dir, alors ceci est 'sounds/water'
                dir_structure_within_source = path_of_file_within_source_dir.parent

                # Maintenant, déterminer le chemin de base sur le serveur si "public" est dans source_dir
                source_dir_parts = source_dir_path_obj.parts
                public_folder_index = -1
                for i, part in enumerate(source_dir_parts):
                    if part.lower() == "public":
                        public_folder_index = i
                        break
                
                server_upload_root_prefix = ""
                if public_folder_index != -1:
                    # Si "public" est trouvé, le chemin sur le serveur commence par les parties de source_dir *après* "public"
                    # ex: si source_dir = /chemin/vers/projet/public/sounds,
                    # server_upload_root_prefix devient "sounds"
                    server_upload_root_prefix_parts = source_dir_parts[public_folder_index + 1:]
                    server_upload_root_prefix = posixpath.join(*server_upload_root_prefix_parts)
                
                # Combiner server_upload_root_prefix avec la structure de répertoires de dir_structure_within_source
                # dir_structure_within_source.parts donnera ('sounds', 'water') ou ('water',) ou ()
                destination_on_server = posixpath.join(server_upload_root_prefix, *dir_structure_within_source.parts)
                
                # Normaliser le chemin (ex: "sounds/." devient "sounds")
                destination_on_server = posixpath.normpath(destination_on_server)
                # Si le chemin normalisé est juste ".", cela signifie la racine, donc chaîne vide.
                if destination_on_server == ".":
                    destination_on_server = ""

                if upload_file(args.api_url, args.api_key, local_file_path, destination_on_server):
                    successful_uploads += 1
                else:
                    failed_uploads += 1
    
    print("\nRésumé du téléversement:")
    print(f"  Fichiers téléversés avec succès : {successful_uploads}")
    print(f"  Échecs de téléversement         : {failed_uploads}")

if __name__ == "__main__":
    main()
