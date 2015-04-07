{:user
  {:dependencies [[org.clojure/clojure "1.6.0"]
                  [spyscope "0.1.5"]
                  [midje "1.6.3"]
                  [org.clojure/tools.namespace "0.2.8"]
                  [cljfmt "0.1.10"]]
   :plugins [[lein-bin "0.3.4"]
             [lein-midje "3.1.3"]
             [cider/cider-nrepl "0.9.0-SNAPSHOT"]
             [venantius/ultra "0.3.3"]]
   :test-paths ["spec/"]
   :ultra {
       :color-scheme :solarized_dark}
   :repl-options {
       :prompt (fn [ns] (str "\u001B[32m[\u001B[34m" ns "\u001B[32m]\u001B[33m λ:\u001B[m " ))}
   :injections [(require '[clojure.tools.namespace.repl :refer [refresh]])]}
 :none {}}
