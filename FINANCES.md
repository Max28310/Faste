# Finances dans Gestion FASTE

Le menu **Finances** rassemble Mes événements, Mes dépenses, Mon argent et Export comptable.

## Interface simple pour le quotidien

Accueil : solde bancaire, clients à encaisser, fournisseurs à payer, résultat toutes charges avant et après IS estimé. Choix mois / trimestre / exercice et pourcentages conservés ; le tableau complet et les explications sont repliés. Le carnet commercial et la marge directe restent accessibles.

Événements : un dossier regroupe facturation HT, coûts directs, marge € / %, encaissements, factures, dépenses / justificatifs et préparation du jour J. Le bouton Ajouter une dépense présélectionne cet événement. La marge directe reste distincte du résultat global après frais généraux.

Devis & factures : recherche, dates du document, état, client et totaux de la sélection. Devis et factures restent séparés ; facturé net d’avoirs, encaissé et restant sont repris depuis les calculs financiers, jamais recomptés comme chiffre d’affaires. Les lignes affichent les montants originaux ; un avoir est signalé et déduit des totaux.

Dépenses : liste courante en premier, filtres mois / à payer / payées / à vérifier / sans justificatif. Les modèles mensuels sont repliés, toujours modifiables. Trésorerie et dossier comptable ont un accès direct. Catalogue, matériel, suivi détaillé et prévisionnel restent dans Catalogue & outils. Les anciennes adresses #finance, #strategy, #materials restent valides. Un mode d’emploi de six étapes est intégré. Les filtres des listes ne modifient pas les résultats ni l’export, dont la période se choisit séparément.

Aucune donnée existante, formule de calcul, règle de paiement, justificatif ou récurrence n’est supprimée par cette adaptation de l’interface.

## Résultat toutes charges et estimation IS

Le Dashboard affiche en priorité les résultats avant IS et après IS estimé, en euros et en pourcentage des recettes HT nettes d'avoirs. Vues **mensuelle, trimestrielle, annuelle** ; choix de l'exercice et de la période. Un mois de début d'exercice configurable définit un exercice standard de 12 mois. Les résultats de périodes futures restent vides ; l'exercice courant est limité aux documents datés jusqu'à aujourd'hui.

Calcul : factures HT − avoirs HT à leur date − charges directes − frais généraux, y compris assurance, logiciel, banque, loyers, honoraires, entretien, rémunérations/charges sociales et intérêts **enregistrés** + ajustements de résultat. Les charges non payées et celles avancées personnellement sont prises en compte. Les investissements et acomptes fournisseurs ne sont pas déduits comme charges : saisir la dotation d'amortissement validée séparément. Les frais non saisis ne peuvent pas être devinés. Pour la paie, faire valider le coût total et son enregistrement ; aucun calcul de paie automatique. TVA non récupérable incluse, TVA récupérable seulement déduite si vérifiée ; unknown conservée TTC par prudence. Les coûts récurrents provisoires sont signalés.

Dans Finances : **Amortissements et ajustements du résultat**, avec date, référence, montant validé et justificatif privé. Aucun mouvement bancaire. Amortissements/provisions/charges négatifs, autres produits positifs ; réintégrations/déductions fiscales modifient seulement la base IS. Annulation conservée, correction par nouvelle ligne. Ne pas doubler une charge déjà saisie. Pour affecter amortissement ou régularisation aux mois, saisir une ligne par mois selon le calcul validé. Le module ne reconnaît pas automatiquement les produits/charges constatés d'avance, travaux non facturés, dettes sociales ou clôtures comptables.

IS estimé : **25 % par défaut** ; option de taux réduit seulement après confirmation de l'éligibilité (CA ≤ 10 M€, capital entièrement libéré et détenu à 75 % au moins par des personnes physiques), **15 % jusqu'à 42 500 € de bénéfice fiscal sur 12 mois puis 25 %**. La base estimée est le résultat avant IS + corrections fiscales saisies. Les déficits reportés doivent être ajoutés uniquement pour le montant de déduction validé ; crédits d'impôt, contributions spécifiques et autres retraitements ne sont pas calculés automatiquement. Un premier exercice d'une durée différente de 12 mois nécessite un calcul fiscal adapté avec le cabinet : ne pas utiliser cette simulation comme déclaration. Paramètres appliqués à toutes les vues historiques : ce ne sont pas des clôtures immuables.

IS affecté à chaque mois/trimestre = IS estimé sur le cumul depuis le début de l'exercice à la fin de période − IS estimé sur le cumul précédent. Le seuil de 42 500 € n'est pas réutilisé chaque mois. Une perte peut réduire une provision d'IS antérieure (IS négatif dans la période) ; aucun remboursement bancaire n'est créé. Résultat après IS = résultat avant IS − variation IS estimée. Montants cumulés et périodiques se réconcilient. Le résultat appartient à la société, pas une rémunération personnelle disponible. Les versements IS/TVA, apports, remboursements de capital et frais remboursés sont des mouvements bancaires et ne sont pas redéduits automatiquement du résultat. Les autres impôts et cotisations à passer en charges doivent être enregistrés comme tels, sans doubler les règlements.

L'export conserve **un seul journal** avec ajustements, pièces et synthèses avant/après IS par exercice couvert. Les estimations figurent dans la colonne Indicateur, sans gonfler les colonnes HT/TVA/TTC ou banque. Sources fiscales vérifiées le 06/10/2026 : https://entreprendre.service-public.gouv.fr/vosdroits/F23575 et https://entreprendre.service-public.gouv.fr/vosdroits/F37169 . Les données TEST sont toujours fictives.

Le Dashboard affiche aussi la **marge des événements en euros et en pourcentage** : cumul des factures HT nettes d'avoirs, moins les coûts courants rattachés aux événements/dossiers. Le pourcentage est calculé sur le total facturé HT, sans moyenner les pourcentages des événements. Les frais généraux non rattachés, rémunérations, amortissements et impôts ne sont pas déduits. La carte signale les pièces/TVA à vérifier et les données TEST. Le bouton Voir par événement ouvre Finances.

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

## Budget et préparation événementielle

Dans le devis, « Budget client et marge prévue » est réservé à FASTE et n’apparaît pas sur le PDF client. Saisir le budget global TTC du client, le mode de facturation (global, prestations FASTE seules ou mixte) et les prestations payées directement par le client. Le devis facture uniquement les lignes FASTE. Exemple : budget client de 30 000 €, devis FASTE de 12 000 € TTC et fournisseurs payés par le client de 18 000 €. Les 18 000 € ne deviennent ni du chiffre d’affaires, ni une dépense, ni un encaissement FASTE.

Ajouter les coûts prévus supportés par FASTE : fournisseurs, locations, transport, logistique et personnel. Saisir HT si la TVA est récupérable, TTC sinon. Cocher « coûts vérifiés » seulement après avoir recensé tous les coûts, même si leur total est zéro. Marge prévue = devis HT − coûts prévus ; pourcentage = marge / devis HT. La valorisation facultative des heures de préparation, montage, exploitation et démontage donne un indicateur supplémentaire. Elle ne crée aucun salaire ni aucune charge comptable ; ne pas valoriser deux fois du personnel déjà compris dans les coûts prévus.

Le dossier reprend le budget et compare coûts/marge prévus aux coûts/marge réalisés saisis dans le module financier. Une facturation ou des dépenses incomplètes sont signalées. Le prévisionnel reste modifiable depuis le devis : ce n’est pas une photographie immuable à la date d’acceptation. L’export unique conserve une ligne informative de budget/marge prévue, sans montant dans les colonnes HT/TVA/TTC ou banque.

## Réservations et disponibilités

Depuis Événements, ouvrir « Planning & disponibilités », ou ajouter une réservation dans le dossier. Choisir du matériel FASTE avec quantité, un équipier ou un prestataire ; renseigner une mission, un début et une fin, puis « À confirmer » ou « Confirmé ». Les heures sont celles de Paris ; pour une prestation après minuit, renseigner la date du lendemain. Une heure inexistante ou ambiguë lors du changement d’heure doit être remplacée par une heure non ambiguë.

Les réservations à confirmer participent aux alertes, mais ne bloquent pas la saisie. La confirmation est contrôlée côté serveur : une quantité de matériel supérieure au stock disponible ou un équipier confirmé sur deux missions simultanées est refusé. Deux missions successives à la même heure de fin/début sont compatibles. Les prestataires peuvent disposer de plusieurs équipes : un chevauchement affiche une alerte à vérifier, sans blocage automatique. Les réservations annulées restent dans l’historique et libèrent la ressource. Maxime et Paul figurent dans l’équipe ; ajouter les autres équipiers avec un nom unique.

Une réservation ne crée aucune dépense ni aucun paiement. Si le client règle directement un prestataire, l’indiquer dans la réservation et dans le budget client. Si FASTE le règle, enregistrer ensuite sa facture dans Dépenses. Les dates des réservations restent indépendantes : après une modification de date de l’événement, revoir les réservations. Le stock correspond aux quantités actuellement saisies dans Matériel ; une modification du stock peut nécessiter de réviser les affectations.
