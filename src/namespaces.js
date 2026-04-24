// UNIT_TYPE=Hook

/**
 * RDF namespace factories — attaches ur.NS with factories for all ontologies used in TwinPod.
 * ur.NS.NEO('a_note'), ur.NS.RDF('type'), ur.NS.SCHEMA('text'), etc.
 */
import * as $rdf from 'rdflib'
import { ur } from './util-rdf.js'

export const NS = {
  NEO:     $rdf.Namespace('https://neo.graphmetrix.net/node/'),
  GMXO:    $rdf.Namespace('https://ontology.graphmetrix.com/node/'),
  LDP:     $rdf.Namespace('http://www.w3.org/ns/ldp#'),
  FOAF:    $rdf.Namespace('http://xmlns.com/foaf/0.1/'),
  RDF:     $rdf.Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  RDFS:    $rdf.Namespace('http://www.w3.org/2000/01/rdf-schema#'),
  XSD:     $rdf.Namespace('http://www.w3.org/2001/XMLSchema#'),
  SCHEMA:  $rdf.Namespace('http://schema.org/'),
  SOLID:   $rdf.Namespace('http://www.w3.org/ns/solid/terms#'),
  VCARD:   $rdf.Namespace('http://www.w3.org/2006/vcard/ns#'),
  PIM:     $rdf.Namespace('http://www.w3.org/ns/pim/space#'),
  ACL:     $rdf.Namespace('http://www.w3.org/ns/auth/acl#'),
  DCTERMS: $rdf.Namespace('http://purl.org/dc/terms/'),
  DUL:     $rdf.Namespace('http://www.ontologydesignpatterns.org/ont/dul/DUL.owl#'),
  SIO:     $rdf.Namespace('http://semanticscience.org/resource/'),
  EVENT:   $rdf.Namespace('http://purl.org/NET/c4dm/event.owl#'),
  PROV:    $rdf.Namespace('http://www.w3.org/ns/prov#'),
  ORG:     $rdf.Namespace('http://www.w3.org/ns/org#'),
}

ur.NS = NS
