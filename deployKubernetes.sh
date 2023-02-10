kubectl expose deploy mycluster-free --port=80 --target-port=8080 --type=LoadBalancer --name my-lb-svc
