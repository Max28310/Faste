# Finances dans Gestion FASTE

Le menu **Finances** rassemble Mes événements, Mes dépenses, Mon argent et Export comptable.

## Tableau comptable unique

L'archive exportée contient **un seul tableau**, dans `FASTE_export_comptable.xlsx`, feuille **Journal comptable**. Son CSV reprend exactement le même journal. Les PDF et originaux restent joints et leurs chemins apparaissent sur les lignes concernées. Les colonnes Type, Statut et Pièce liée permettent de filtrer les documents et retrouver leurs règlements. Le journal regroupe factures, avoirs négatifs, dépenses, règlements, frais personnels et autres mouvements. Les HT/TVA/TTC des documents ne sont pas répétés sur les paiements ; les mouvements bancaires ont leurs propres colonnes. Les documents hors période, devis à facturer et synthèses marge/trésorerie/BFR sont informatifs, sans montant dans les colonnes de facturation ou de banque. Ne pas additionner les synthèses aux opérations. Les lignes annulées sont conservées avec incidence nulle. Les dépenses provisoires restent signalées. Bordures noires, filtres, en-tête et premières colonnes figés. Un texte court dans l'archive précise ces règles ; aucun autre tableau séparé n'est produit.

## Dépenses mensuelles et avoirs

Dans Mes dépenses, **Dépense récurrente** enregistre un fournisseur, un montant HT/TVA, un jour et des dates de début/fin. Un job PostgreSQL horaire (minute 15) crée les échéances arrivées, même application fermée ; le chargement du module rattrape aussi les échéances. Chaque mois est unique. Le 31 devient le dernier jour du mois si nécessaire. Une pause empêche les nouvelles lignes ; reprendre rattrape les échéances manquantes sur la période active. Pour un arrêt définitif, renseigner une date de fin. Une modification de montant du modèle concerne les futures lignes, sans réécrire les mois créés.

Les lignes générées sont **À vérifier**, sans paiement, sans déduction de TVA automatique et sans justificatif inventé. Ouvrir la dépense, vérifier montant et référence sur la facture mensuelle, joindre la pièce et cocher Montants vérifiés. Le modèle ne copie pas le justificatif d'un autre mois. Les prévisions incluent les récurrences futures, sans les confondre avec des dépenses déjà facturées. L'export signale les dépenses provisoires à vérifier avant comptabilisation.

Les avoirs sont enregistrés dans Mes événements, sur une facture non soldée : motif, date, réduction HT et TVA. Ils réduisent les recettes et le restant, sans changer les encaissements ni la banque. Le remboursement d'une facture payée n'est pas pris en charge par cette première version. L'export ajoute les avoirs en Excel, CSV et PDF de gestion ; les montants positifs des avoirs sont à soustraire. Les pièces officielles et leur conformité restent à contrôler avant usage réel.

## Jeu de test du 6 octobre 2026

`supabase/demo_finance.sql` contient quatre clients TEST, quatre devis dont un à facturer, trois factures (3 600 € payés ; 2 400 € moins avoir de 240 € ; 6 000 € avec acompte de 1 800 €), un avoir, trois dépenses d'événement et deux lignes mensuelles (assurance 90 € sans TVA ; logiciel 30 € TTC). Les modèles TEST sont limités à octobre. Les dépenses n'ont pas de justificatifs originaux fictivement téléversés. Les PDF clients et d'avoir sont générés dans l'export. Ces données affectent les indicateurs : les nettoyer avant exploitation réelle. Le solde 0 € de l'essai précédent a été daté au 5 octobre pour montrer les mouvements du 6 : trésorerie de test 4 680 € ; client restant 6 360 € ; fournisseurs restant 720 € ; frais personnels Maxime 120 €.

## Démarrage

1. Mon argent : saisir un solde bancaire vérifié de fin de journée. Aucun zéro n’est présumé.
2. Mes événements : les devis acceptés, factures et dossiers existants sont repris automatiquement.
3. Ajouter une dépense : fournisseur, référence, dossier, HT/TVA, échéance et justificatif.
4. Enregistrer chaque paiement client/fournisseur avec date, montant et référence. Les acomptes sont des paiements partiels, pas des recettes supplémentaires.
5. Export comptable : sélectionner une période et télécharger l’archive Excel/CSV/PDF/pièces originales.

## Justificatifs et lecture

PDF/JPEG/PNG/WebP/HEIC/HEIF, 10 Mo par fichier. Stockage Supabase privé `faste-finance`, même accès que les deux associés de l’application. Pas de lien public permanent. L’ouverture utilise une URL valable cinq minutes.

Le bouton **Lire le justificatif sélectionné** traite les images et PDF sur l’appareil, avec Tesseract.js 5.1.1 et PDF.js 4.10.38. Les moteurs/modèles publics sont téléchargés ; les pièces ne sont pas envoyées à un service OCR tiers. Les PDF scannés passent par OCR, les PDF texte par extraction locale. Maximum 20 pages. HEIC/HEIF peuvent être joints, mais la lecture demande PDF/JPEG/PNG/WebP.

La lecture propose des valeurs, sans enregistrer de dépense. L’utilisateur doit les vérifier et confirmer avant application. Un total incohérent bloque l’application. La déduction TVA, le paiement et l’échéance ne sont jamais déduits de l’OCR.

## Calculs

- TVA des dépenses : 20 % par défaut, montant exact de la facture modifiable. Droit à déduction séparé ; inconnu = coût TTC conservateur.
- Marge directe facturée : factures HT moins dépenses courantes rattachées, après TVA récupérable validée. Pourcentage = marge / facturé HT. Sans CA, pourcentage non calculable. Avant frais généraux non rattachés, temps, rémunérations, amortissements, impôts.
- Investissements exclus des charges de marge, inclus en trésorerie.
- Acompte fournisseur : une ligne initiale de nature Acompte ; à la facture finale, modifier cette même ligne en Dépense courante avec les montants complets. Les paiements historiques restent déduits.
- Frais Paul/Maxime : fournisseur payé sans sortie du compte FASTE ; remboursement dans Autres mouvements, sans seconde charge.
- Trésorerie : solde vérifié + mouvements bancaires postérieurs, à rapprocher du relevé. Pas de connexion bancaire automatique ni multi-compte.
- Prévision six mois : échéances des restants et autres flux prévus ; pas de devis non facturés. Retards/non datés signalés, exclus jusqu’à replanification.
- BFR opérationnel estimé : créances événements réalisés + acomptes fournisseurs versés − dettes fournisseurs courantes − acomptes clients avant événement. Selon date événement/statut Terminé ; sans date = à venir. Hors stocks, fiscalité/social et ajustements. Ce n’est pas un BFR comptable exhaustif.

## Historique, export et sécurité

Les encaissements préexistants sont conservés en `documents.finance_initial_paid`. Leur date n’est pas inventée ; ils ne sont pas ajoutés au solde vérifié. Pour les factures avec nouveaux paiements, le total payé est calculé côté serveur et les modifications anciennes ne l’écrasent plus.

Paiements append-only : correction par annulation puis nouvelle saisie. Pas de remboursement bancaire exécuté par l’application. Les dépenses avec paiement ne peuvent pas être archivées ou réduites sous le payé. Les pièces rattachées sont conservées.

L’archive contient les documents de la période, leurs lignes, paiements datés, autres mouvements, marges cumulées à fin de période, manifest des pièces, pièces originales et PDF clients générés depuis les données actuelles. Les dossiers hors période liés à un paiement sont inclus séparément. Export de gestion, pas FEC ni déclaration TVA. Aucune transmission automatique au comptable.

Tables protégées par RLS, autorisation identique aux associés existants. Bucket privé avec limite/type MIME ; URL signée à durée limitée. Dépendances navigateur épinglées à leur version, comme le SDK/PDF existants : JSZip 3.10.1, ExcelJS 4.4.0, Tesseract.js 5.1.1, PDF.js 4.10.38. Les bibliothèques restent sous leurs licences upstream (MIT/Apache-2.0).

## Validation

`npm ci && npm test` : tests de calculs, formulaires DOM, vrais formats Excel/ZIP et propositions OCR. Tests PostgreSQL transactionnels avec ROLLBACK : paiement partiel, dépassement, annulation, protection contre écrasement et accès étranger refusé. Aucune donnée test conservée.

Le contrôle Supabase n’a signalé aucune nouvelle alerte RLS. L’alerte préexistante de protection contre les mots de passe compromis reste distincte : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

La connexion réelle au navigateur nécessite la session d’un associé : aucune preuve de test connecté bout en bout n’est revendiquée sans cette session.
